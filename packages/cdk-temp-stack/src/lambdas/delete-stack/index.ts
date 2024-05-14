import { CloudFormationClient, DeleteStackCommand } from '@aws-sdk/client-cloudformation';

const cfn = new CloudFormationClient();

interface DeleteStackEvent {
  stackId: string;
}

export const handler = async (event: DeleteStackEvent): Promise<void> => {
  console.log(event);

  const { stackId } = event;

  await cfn.send(
    new DeleteStackCommand({
      StackName: stackId,
    }),
  );

  console.log(`Stack ${stackId} deleted!`);
};
