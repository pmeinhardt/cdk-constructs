import {
  CodeCommitClient,
  PostCommentForPullRequestCommand,
  UpdatePullRequestApprovalStateCommand,
} from '@aws-sdk/client-codecommit';
import type { CodeBuildCloudWatchStateEvent } from 'aws-lambda';
import { getBoolEnv } from 'get-env-or-die';

const codeCommit = new CodeCommitClient();

export const handler = async (event: CodeBuildCloudWatchStateEvent): Promise<void> => {
  const { region, detail } = event;

  const shouldUpdateApprovalState = getBoolEnv('UPDATE_APPROVAL_STATE', false);

  const shouldPostComment = getBoolEnv('POST_COMMENT', false);

  const { pullRequestId, revisionId, repositoryName, beforeCommitId, afterCommitId } = getPullRequestProps(detail);

  const s3Prefix = region === 'us-east-1' ? 's3' : `s3-${region}`;

  switch (detail['build-status']) {
    case CodeBuildState.IN_PROGRESS:
      if (shouldUpdateApprovalState) {
        await codeCommit.send(
          new UpdatePullRequestApprovalStateCommand({
            pullRequestId,
            revisionId,
            approvalState: 'REVOKE',
          }),
        );
      }

      if (shouldPostComment) {
        await codeCommit.send(
          new PostCommentForPullRequestCommand({
            pullRequestId,
            repositoryName,
            beforeCommitId,
            afterCommitId,
            content: `** Build started at ${'time'} **`,
          }),
        );
      }
      break;

    case CodeBuildState.FAILED:
      if (shouldPostComment) {
        const badge = `https://${s3Prefix}.amazonaws.com/codefactory-${region}-prod-default-build-badges/failing.svg`;

        const content = `![Failing](${badge} "Failing") - See the [Logs](${detail['additional-information'].logs['deep-link']})`;

        await codeCommit.send(
          new PostCommentForPullRequestCommand({
            pullRequestId,
            repositoryName,
            beforeCommitId,
            afterCommitId,
            content,
          }),
        );
      }
      break;

    case CodeBuildState.SUCCEEDED:
      if (shouldUpdateApprovalState) {
        await codeCommit.send(
          new UpdatePullRequestApprovalStateCommand({
            pullRequestId,
            revisionId,
            approvalState: 'APPROVE',
          }),
        );
      }

      if (shouldPostComment) {
        const badge = `https://${s3Prefix}.amazonaws.com/codefactory-${region}-prod-default-build-badges/passing.svg`;

        const content = `![Passing](${badge} "Passing") - See the [Logs](${detail['additional-information'].logs['deep-link']})`;

        await codeCommit.send(
          new PostCommentForPullRequestCommand({
            pullRequestId,
            repositoryName,
            beforeCommitId,
            afterCommitId,
            content,
          }),
        );
      }
      break;

    case CodeBuildState.STOPPED:
      console.log('Build stopped!');
      break;

    default:
      throw new Error(`Invalid build status: ${detail['build-status']}`);
  }
};

interface PullrequestProps {
  repositoryName: string;
  pullRequestId: string;
  beforeCommitId: string;
  afterCommitId: string;
  revisionId: string;
}

const getPullRequestProps = (detail: CodeBuildCloudWatchStateEvent['detail']): PullrequestProps => {
  let repositoryName = '';
  let pullRequestId = '';
  let beforeCommitId = '';
  let afterCommitId = '';
  let revisionId = '';

  detail['additional-information'].environment['environment-variables'].forEach(({ name, value }) => {
    switch (name) {
      case 'pullRequestId':
        pullRequestId = value;
        break;
      case 'repositoryName':
        repositoryName = value;
        break;
      case 'sourceCommit':
        beforeCommitId = value;
        break;
      case 'destinationCommit':
        afterCommitId = value;
        break;
      case 'revisionId':
        revisionId = value;
        break;
    }
  });

  return {
    repositoryName,
    pullRequestId,
    beforeCommitId,
    afterCommitId,
    revisionId,
  };
};

enum CodeBuildState {
  'IN_PROGRESS' = 'IN_PROGRESS',
  'SUCCEEDED' = 'SUCCEEDED',
  'FAILED' = 'FAILED',
  'STOPPED' = 'STOPPED',
}
