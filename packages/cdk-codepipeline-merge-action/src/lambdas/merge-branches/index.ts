import { CodeCommitClient, MergeBranchesByFastForwardCommand } from '@aws-sdk/client-codecommit';
import { CodePipelineClient, PutJobFailureResultCommand, PutJobSuccessResultCommand } from '@aws-sdk/client-codepipeline';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import type { CodePipelineEvent } from 'aws-lambda';
import { getEnv } from 'get-env-or-die';

// default session
const codePipeline = new CodePipelineClient();
const sts = new STSClient();

export const handler = async (event: CodePipelineEvent): Promise<string> => {
  const { id: jobId, data: jobData } = event['CodePipeline.job'];

  try {
    const { repositoryName, sourceCommitSpecifier, destinationCommitSpecifier } = getUserParams(jobData);

    const codeCommitRoleArn = getEnv('CODE_COMMIT_ROLE_ARN', '');

    const codeCommit = await (async () => {
      if (!codeCommitRoleArn) {
        return new CodeCommitClient();
      }

      const { Credentials: credentials } = await sts.send(new AssumeRoleCommand({
        RoleArn: codeCommitRoleArn,
        RoleSessionName: `Merge-${repositoryName}-${sourceCommitSpecifier}-${destinationCommitSpecifier}`,
      }));

      if (!credentials) {
        throw new Error('Crossaccount role could not be assumed');
      }

      return new CodeCommitClient({
        credentials: {
          accessKeyId: credentials.AccessKeyId!,
          secretAccessKey: credentials.SecretAccessKey!,
          sessionToken: credentials.SessionToken,
        }
      });
    })();

    const { commitId } = await codeCommit.send(new MergeBranchesByFastForwardCommand({
      repositoryName,
      sourceCommitSpecifier,
      destinationCommitSpecifier,
    }));

    await putJobSuccess(jobId, commitId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.log(error);
    await putJobFailure(jobId, `Function exception: ${error.message}`);
  }

  console.log('Function complete.');
  return 'Complete.';
};

/**
 * Decodes the JSON user parameters and validates the required properties
 *
 * @param jobData The job data structure containing the UserParameters string which should be a valid JSON structure
 */
const getUserParams = (
  jobData: CodePipelineEvent['CodePipeline.job']['data'],
): {
  repositoryName: string;
  sourceCommitSpecifier: string;
  destinationCommitSpecifier: string;
} => {
  const { UserParameters: userParameters } = jobData.actionConfiguration.configuration;

  const { repositoryName, sourceCommitSpecifier, destinationCommitSpecifier } = JSON.parse(userParameters);

  if (!repositoryName) {
    throw new Error('Your UserParameters JSON must include the repository name');
  }

  if (!sourceCommitSpecifier) {
    throw new Error('Your UserParameters JSON must include the sourceCommitSpecifier');
  }

  if (!destinationCommitSpecifier) {
    throw new Error('Your UserParameters JSON must include the destinationCommitSpecifier');
  }

  return {
    repositoryName,
    sourceCommitSpecifier,
    destinationCommitSpecifier,
  };
};

/**
 * Notify CodePipeline of a successful job
 *
 * @param jobId The CodePipeline job ID
 * @param message A message to be logged relating to the job status
 */
const putJobSuccess = async (jobId: string, message?: string): Promise<void> => {
  console.log('Putting job success');

  if (message) {
    console.log(message);
  }

  await codePipeline.send(new PutJobSuccessResultCommand({
    jobId,
  }));
};

/**
 * Notify CodePipeline of a failed job
 *
 * @param jobId The CodePipeline job ID
 * @param message A message to be logged relating to the job status
 */
const putJobFailure = async (jobId: string, message: string): Promise<void> => {
  console.log('Putting job failure');
  console.log(message);

  await codePipeline.send(new PutJobFailureResultCommand({
    jobId,
    failureDetails: {
      message,
      type: 'JobFailed',
    },
  }));
};
