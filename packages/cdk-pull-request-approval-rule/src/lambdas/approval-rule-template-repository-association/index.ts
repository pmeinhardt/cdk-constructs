import {
  AssociateApprovalRuleTemplateWithRepositoryCommand,
  CodeCommitClient,
  DisassociateApprovalRuleTemplateFromRepositoryCommand,
} from '@aws-sdk/client-codecommit';
import type {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from 'aws-lambda';

export interface ApprovalRuleRepositoryAssociationProps {
  approvalRuleTemplateName: string;
  repositoryName: string;
}

interface HandlerReturn {
  PhysicalResourceId: string;
}

const codecommit = new CodeCommitClient();

const getProperties = (
  props:
    | CloudFormationCustomResourceEvent['ResourceProperties']
    | CloudFormationCustomResourceUpdateEvent['OldResourceProperties'],
): ApprovalRuleRepositoryAssociationProps => ({
  approvalRuleTemplateName: props.ApprovalRuleTemplateName,
  repositoryName: props.RepositoryName,
});

const onCreate = async (event: CloudFormationCustomResourceCreateEvent): Promise<HandlerReturn> => {
  const { approvalRuleTemplateName, repositoryName } = getProperties(event.ResourceProperties);

  await codecommit.send(
    new AssociateApprovalRuleTemplateWithRepositoryCommand({
      approvalRuleTemplateName,
      repositoryName,
    }),
  );

  return {
    PhysicalResourceId: approvalRuleTemplateName,
  };
};

const onUpdate = async (event: CloudFormationCustomResourceUpdateEvent): Promise<HandlerReturn> => {
  const newProps = getProperties(event.ResourceProperties);
  const oldProps = getProperties(event.OldResourceProperties);

  if (
    newProps.repositoryName !== oldProps.repositoryName ||
    newProps.approvalRuleTemplateName !== oldProps.approvalRuleTemplateName
  ) {
    await codecommit.send(
      new DisassociateApprovalRuleTemplateFromRepositoryCommand({
        approvalRuleTemplateName: oldProps.approvalRuleTemplateName,
        repositoryName: oldProps.repositoryName,
      }),
    );

    await codecommit.send(
      new AssociateApprovalRuleTemplateWithRepositoryCommand({
        approvalRuleTemplateName: newProps.approvalRuleTemplateName,
        repositoryName: newProps.repositoryName,
      }),
    );
  }

  return {
    PhysicalResourceId: newProps.approvalRuleTemplateName,
  };
};

const onDelete = async (event: CloudFormationCustomResourceDeleteEvent): Promise<void> => {
  const { approvalRuleTemplateName, repositoryName } = getProperties(event.ResourceProperties);

  await codecommit.send(
    new DisassociateApprovalRuleTemplateFromRepositoryCommand({
      approvalRuleTemplateName,
      repositoryName,
    }),
  );
};

export const handler = async (event: CloudFormationCustomResourceEvent): Promise<HandlerReturn | void> => {
  const requestType = event.RequestType;

  switch (requestType) {
    case 'Create':
      return onCreate(event);
    case 'Update':
      return onUpdate(event);
    case 'Delete':
      return onDelete(event);
    default:
      throw new Error(`Invalid request type: ${requestType}`);
  }
};
