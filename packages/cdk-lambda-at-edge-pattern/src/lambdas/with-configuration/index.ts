import { GetFunctionCommand, LambdaClient, UpdateFunctionCodeCommand } from '@aws-sdk/client-lambda';
import { mkdtempSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import Zip from 'adm-zip';
import type {
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceEventCommon,
} from 'aws-lambda';
import axios from 'axios';
import { camelizeKeys, customResourceHelper, OnCreateHandler, OnUpdateHandler, ResourceHandler, ResourceHandlerReturn } from 'custom-resource-helper';

interface WithConfiguration {
  region: string;
  functionName: string;
  configuration: string;
}

const updateLambdaCode = async (
  event: CloudFormationCustomResourceCreateEvent | CloudFormationCustomResourceUpdateEvent,
): Promise<ResourceHandlerReturn> => {
  const { region, functionName, configuration } = camelizeKeys<WithConfiguration, CloudFormationCustomResourceEventCommon['ResourceProperties']>(
    event.ResourceProperties,
  );

  const lambda = new LambdaClient({
    region,
  });

  const { Code: code } = await lambda.send(new GetFunctionCommand({
    FunctionName: functionName,
  }));

  if (!code?.Location) {
    throw new Error(`The code of the lambda function ${functionName} could not be downloaded.`);
  }

  const { data } = await axios.get<Buffer>(code.Location, {
    responseType: 'arraybuffer',
  });

  const lambdaZip = new Zip(data);

  const tempDir = mkdtempSync('/tmp/lambda-package');

  lambdaZip.extractAllTo(tempDir, true);

  writeFileSync(resolve(tempDir, 'configuration.json'), Buffer.from(configuration));

  const newLambdaZip = new Zip();

  newLambdaZip.addLocalFolder(tempDir);

  const {
    CodeSha256: codeSha256,
    Version: version,
    FunctionArn: functionArn,
  } = await lambda.send(new UpdateFunctionCodeCommand({
    FunctionName: functionName,
    ZipFile: newLambdaZip.toBuffer(),
    Publish: true,
  }));

  return {
    physicalResourceId: functionName,
    responseData: {
      CodeSha256: codeSha256,
      Version: version,
      FunctionArn: functionArn,
    },
  };
};

const handleCreate: OnCreateHandler = async (event): Promise<ResourceHandlerReturn> => updateLambdaCode(event);

const handleUpdate: OnUpdateHandler = async (event): Promise<ResourceHandlerReturn> => updateLambdaCode(event);

export const handler = customResourceHelper(
  (): ResourceHandler => ({
    onCreate: handleCreate,
    onUpdate: handleUpdate,
  }),
);
