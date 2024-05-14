import { CodePipelineClient, GetPipelineExecutionCommand, GetPipelineStateCommand } from '@aws-sdk/client-codepipeline';
import type { CodePipelineCloudWatchEvent } from 'aws-lambda';
import { getEnv } from 'get-env-or-die';

import { NotifierMessageBuilder } from './notifier-message-builder';
import { SlackBot } from './slack-bot';

const bot = new SlackBot({
  token: getEnv('SLACK_BOT_TOKEN'),
  channelName: getEnv('SLACK_CHANNEL', ''),
  channelId: getEnv('SLACK_CHANNEL_ID', ''),
  channelTypes: getEnv('SLACK_CHANNEL_TYPES'),
  name: getEnv('SLACK_BOT_NAME', 'Pipeline Bot'),
  icon: getEnv('SLACK_BOT_ICON', ':robot_face:'),
});

const codePipeline = new CodePipelineClient({ apiVersion: '2015-07-09' });

export const processCodePipeline = async (event: CodePipelineCloudWatchEvent): Promise<void> => {
  const executionId = event.detail['execution-id'];
  const isStateChange = event['detail-type'] === 'CodePipeline Stage Execution State Change';

  if (!isStateChange) {
    return;
  }

  const pipelineState = await codePipeline.send(
    new GetPipelineStateCommand({
      name: event.detail.pipeline,
    }),
  );

  const { pipelineExecution } = await codePipeline.send(
    new GetPipelineExecutionCommand({
      pipelineName: event.detail.pipeline,
      pipelineExecutionId: executionId,
    }),
  );

  const notifierMessageBuilder = NotifierMessageBuilder.fromPipelineEventAndPipelineState(
    event,
    pipelineState,
    pipelineExecution,
  );

  //  builder.updatePipelineEvent(event);

  const existingMessage = await bot.findMessageForExecutionId(executionId);

  const { message } = notifierMessageBuilder;

  if (existingMessage?.ts) {
    message.ts = existingMessage.ts;
    await bot.updateMessage(existingMessage.ts, message);
  } else {
    await bot.postMessage(message);
  }
};
