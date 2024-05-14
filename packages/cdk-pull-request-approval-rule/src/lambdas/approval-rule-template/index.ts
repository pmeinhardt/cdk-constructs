import {
  ApprovalRuleTemplate,
  CodeCommitClient,
  CreateApprovalRuleTemplateCommand,
  DeleteApprovalRuleTemplateCommand,
  GetApprovalRuleTemplateCommand,
  UpdateApprovalRuleTemplateContentCommand,
  UpdateApprovalRuleTemplateDescriptionCommand,
  UpdateApprovalRuleTemplateNameCommand,
} from '@aws-sdk/client-codecommit';
import type {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from 'aws-lambda';

interface Approvers {
  numberOfApprovalsNeeded: number;
  approvalPoolMembers?: string[];
}

interface Template {
  destinationReferences?: string[];
  approvers: Approvers;
}

interface HandlerReturn {
  PhysicalResourceId: string;
  Data: {
    ApprovalRuleTemplateName: string;
  };
}

export interface ApprovalRuleTemplateProps {
  approvalRuleTemplateName: string;
  approvalRuleTemplateDescription?: string;
  template: Template;
}

const codecommit = new CodeCommitClient();

const getProperties = (
  props:
    | CloudFormationCustomResourceEvent['ResourceProperties']
    | CloudFormationCustomResourceUpdateEvent['OldResourceProperties'],
): ApprovalRuleTemplateProps => ({
  approvalRuleTemplateName: props.ApprovalRuleTemplateName,
  approvalRuleTemplateDescription: props.ApprovalRuleTemplateDescription,
  template: {
    destinationReferences: props.Template.DestinationReferences,
    approvers: {
      numberOfApprovalsNeeded: props.Template.Approvers.NumberOfApprovalsNeeded,
      approvalPoolMembers: props.Template.Approvers.ApprovalPoolMembers,
    },
  },
});

const buildTemplateContent = (template: Template): string => {
  const templateContent = {
    Version: '2018-11-08',
    DestinationReferences: template.destinationReferences || undefined,
    Statements: [
      {
        Type: 'Approvers',
        NumberOfApprovalsNeeded: template.approvers.numberOfApprovalsNeeded,
        ApprovalPoolMembers: template.approvers.approvalPoolMembers || undefined,
      },
    ],
  };
  return JSON.stringify(templateContent, null, 2);
};

const onCreate = async (event: CloudFormationCustomResourceCreateEvent): Promise<HandlerReturn> => {
  const {
    approvalRuleTemplateName,
    approvalRuleTemplateDescription = '',
    template,
  } = getProperties(event.ResourceProperties);

  const { approvalRuleTemplate } = await codecommit.send(
    new CreateApprovalRuleTemplateCommand({
      approvalRuleTemplateName,
      approvalRuleTemplateDescription,
      approvalRuleTemplateContent: buildTemplateContent(template),
    }),
  );

  return {
    PhysicalResourceId: approvalRuleTemplate?.approvalRuleTemplateId as string,
    Data: {
      ApprovalRuleTemplateName: approvalRuleTemplate?.approvalRuleTemplateName as string,
    },
  };
};

const onUpdate = async (event: CloudFormationCustomResourceUpdateEvent): Promise<HandlerReturn> => {
  const newProps = getProperties(event.ResourceProperties);
  const oldProps = getProperties(event.OldResourceProperties);

  let approvalRuleTemplate: ApprovalRuleTemplate | undefined;

  if (buildTemplateContent(newProps.template) !== buildTemplateContent(oldProps.template)) {
    const response = await codecommit.send(
      new UpdateApprovalRuleTemplateContentCommand({
        approvalRuleTemplateName: oldProps.approvalRuleTemplateName,
        newRuleContent: buildTemplateContent(newProps.template),
      }),
    );

    approvalRuleTemplate = response.approvalRuleTemplate;
  }

  if (newProps.approvalRuleTemplateDescription !== oldProps.approvalRuleTemplateDescription) {
    const response = await codecommit.send(
      new UpdateApprovalRuleTemplateDescriptionCommand({
        approvalRuleTemplateName: oldProps.approvalRuleTemplateName,
        approvalRuleTemplateDescription: newProps.approvalRuleTemplateDescription || '',
      }),
    );

    approvalRuleTemplate = response.approvalRuleTemplate;
  }

  if (newProps.approvalRuleTemplateName !== oldProps.approvalRuleTemplateName) {
    const response = await codecommit.send(
      new UpdateApprovalRuleTemplateNameCommand({
        newApprovalRuleTemplateName: newProps.approvalRuleTemplateName,
        oldApprovalRuleTemplateName: oldProps.approvalRuleTemplateName,
      }),
    );

    approvalRuleTemplate = response.approvalRuleTemplate;
  }

  if (!approvalRuleTemplate) {
    const response = await codecommit.send(
      new GetApprovalRuleTemplateCommand({
        approvalRuleTemplateName: oldProps.approvalRuleTemplateName,
      }),
    );

    approvalRuleTemplate = response.approvalRuleTemplate;
  }

  return {
    PhysicalResourceId: approvalRuleTemplate?.approvalRuleTemplateId as string,
    Data: {
      ApprovalRuleTemplateName: approvalRuleTemplate?.approvalRuleTemplateName as string,
    },
  };
};

const onDelete = async (event: CloudFormationCustomResourceDeleteEvent): Promise<void> => {
  const { approvalRuleTemplateName } = getProperties(event.ResourceProperties);

  await codecommit.send(
    new DeleteApprovalRuleTemplateCommand({
      approvalRuleTemplateName,
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
