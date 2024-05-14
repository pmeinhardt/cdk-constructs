import {
  CreateServiceCommand,
  DeleteServiceCommand,
  DeploymentConfiguration,
  ECSClient,
  LaunchType,
  PropagateTags,
  SchedulingStrategy,
  TagResourceCommand,
  UntagResourceCommand,
  UpdateServiceCommand,
  waitUntilServicesInactive,
} from "@aws-sdk/client-ecs";
import type { CloudFormationCustomResourceEvent } from "aws-lambda";
import {
  customResourceHelper,
  OnCreateHandler,
  OnUpdateHandler,
  OnDeleteHandler,
  ResourceHandler,
  ResourceHandlerReturn,
} from "custom-resource-helper";

export interface Tag {
  Key: string;
  Value: string;
}

export interface BlueGreenServiceProps {
  cluster: string;
  serviceName: string;
  containerName: string;
  taskDefinition: string;
  launchType: LaunchType;
  platformVersion: string;
  desiredCount: number;
  subnets: string[];
  securityGroups: string[];
  targetGroupArn: string;
  containerPort: number;
  schedulingStrategy: SchedulingStrategy;
  healthCheckGracePeriodSeconds: number;
  deploymentConfiguration: DeploymentConfiguration;
  propagateTags: PropagateTags;
  tags: Tag[];
}

const ecs = new ECSClient();

const getProperties = (
  props: CloudFormationCustomResourceEvent["ResourceProperties"]
): BlueGreenServiceProps => ({
  cluster: props.Cluster,
  serviceName: props.ServiceName,
  containerName: props.ContainerName,
  taskDefinition: props.TaskDefinition,
  launchType: props.LaunchType,
  platformVersion: props.PlatformVersion,
  desiredCount: props.DesiredCount,
  subnets: props.Subnets,
  securityGroups: props.SecurityGroups,
  targetGroupArn: props.TargetGroupArn,
  containerPort: props.ContainerPort,
  schedulingStrategy: props.SchedulingStrategy,
  healthCheckGracePeriodSeconds: props.HealthCheckGracePeriodSeconds,
  deploymentConfiguration: props.DeploymentConfiguration,
  propagateTags: props.PropagateTags,
  tags: props.Tags ?? [],
});

export const handleCreate: OnCreateHandler = async (
  event
): Promise<ResourceHandlerReturn> => {
  const {
    cluster,
    serviceName,
    containerName,
    taskDefinition,
    launchType,
    platformVersion,
    desiredCount,
    subnets,
    securityGroups,
    targetGroupArn,
    containerPort,
    schedulingStrategy,
    healthCheckGracePeriodSeconds,
    deploymentConfiguration,
    propagateTags,
    tags,
  } = getProperties(event.ResourceProperties);

  const { service } = await ecs.send(
    new CreateServiceCommand({
      cluster,
      serviceName,
      taskDefinition,
      launchType,
      platformVersion,
      desiredCount,
      schedulingStrategy,
      propagateTags,
      deploymentController: {
        type: "CODE_DEPLOY",
      },
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets,
          securityGroups,
        },
      },
      deploymentConfiguration,
      healthCheckGracePeriodSeconds,
      loadBalancers: [
        {
          targetGroupArn,
          containerPort,
          containerName,
        },
      ],
      tags: tags.map((t) => {
        return { key: t.Key, value: t.Value };
      }),
    })
  );

  if (!service) throw Error("Service could not be created");

  return {
    physicalResourceId: service.serviceArn as string,
    responseData: {
      ServiceName: service.serviceName as string,
    },
  };
};

/**
 * For services using the blue/green (CODE_DEPLOY) deployment controller,
 * only the desired count, deployment configuration, task placement constraints
 * and strategies, and health check grace period can be updated using this API.
 * If the network configuration, platform version, or task definition need to be
 * updated, a new AWS CodeDeploy deployment should be created.
 * For more information, see CreateDeployment in the AWS CodeDeploy API Reference.
 */
export const handleUpdate: OnUpdateHandler = async (
  event
): Promise<ResourceHandlerReturn> => {
  const {
    cluster,
    serviceName,
    desiredCount,
    deploymentConfiguration,
    healthCheckGracePeriodSeconds,
    tags,
  } = getProperties(event.ResourceProperties);

  const { service } = await ecs.send(
    new UpdateServiceCommand({
      service: serviceName,
      cluster,
      desiredCount,
      deploymentConfiguration,
      healthCheckGracePeriodSeconds,
    })
  );

  if (!service) throw Error("Service could not be updated");

  const newTagKeys: string[] = tags.map((t: Tag) => t.Key);
  const removableTagKeys: string[] = (event.OldResourceProperties.Tags || [])
    .map((t: Tag) => t.Key)
    .filter((t: string) => !newTagKeys.includes(t));

  if (removableTagKeys.length > 0) {
    await ecs.send(
      new UntagResourceCommand({
        resourceArn: service.serviceArn as string,
        tagKeys: removableTagKeys,
      })
    );
  }

  if (tags.length > 0) {
    await ecs.send(
      new TagResourceCommand({
        resourceArn: service.serviceArn as string,
        tags: tags.map((t) => {
          return { key: t.Key, value: t.Value };
        }),
      })
    );
  }

  return {
    physicalResourceId: service.serviceArn as string,
    responseData: {
      ServiceName: service.serviceName as string,
    },
  };
};

const handleDelete: OnDeleteHandler = async (event): Promise<void> => {
  const { cluster, serviceName } = getProperties(event.ResourceProperties);

  await ecs.send(
    new DeleteServiceCommand({
      service: serviceName,
      cluster,
      force: true,
    })
  );

  /**
   * This constant is added to make the waiter behave in AWS SDK v3 similar to what was in v2.
   * In AWS SDK v2 the waiter polls every 15 seconds (at most 40 times).
   * https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/ECS.html#servicesInactive-waiter
   */
  const MAX_WAIT_TIME = 40 * 15;

  const waiterConfiguration = {
    client: ecs,
    maxWaitTime: MAX_WAIT_TIME,
  };

  await waitUntilServicesInactive(waiterConfiguration, {
    cluster,
    services: [serviceName],
  });
};

export const handler = customResourceHelper(
  (): ResourceHandler => ({
    onCreate: handleCreate,
    onUpdate: handleUpdate,
    onDelete: handleDelete,
  })
);
