import {
  CreateServiceCommand,
  DeploymentControllerType,
  ECSClient,
  SchedulingStrategy,
  TagResourceCommand,
  UntagResourceCommand,
  UpdateServiceCommand,
} from '@aws-sdk/client-ecs';
import { mockClient } from 'aws-sdk-client-mock';

const ecsClientMock = mockClient(ECSClient);

import { handleCreate, handleUpdate } from '../../../lambdas/ecs-service';
import { defaultContext } from '../__fixtures__/default-context';
import { defaultEcsServiceResourceProperties } from '../__fixtures__/default-ecs-service-resource-properties';
import { defaultEvent } from '../__fixtures__/default-event';
import { defaultLogger } from '../__fixtures__/default-logger';

afterEach(() => {
  ecsClientMock.reset();
});

describe('createHandler', () => {
  test('sends tags with create request', async () => {
    const requestParams = {
      cluster: 'foo',
      serviceName: 'foo',
      taskDefinition: 'foo',
      launchType: undefined,
      platformVersion: '1.1.0',
      desiredCount: 1,
      schedulingStrategy: SchedulingStrategy.REPLICA,
      propagateTags: undefined,
      deploymentController: {
        type: DeploymentControllerType.CODE_DEPLOY,
      },
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: ['foo'],
          securityGroups: ['foo'],
        },
      },
      deploymentConfiguration: {},
      healthCheckGracePeriodSeconds: 3,
      loadBalancers: [
        {
          targetGroupArn: 'foo',
          containerPort: 8080,
          containerName: 'foo',
        },
      ],
      tags: [
        { key: 'foo', value: 'bar' },
        { key: 'k', value: 'west' },
      ],
    };

    ecsClientMock.on(CreateServiceCommand, requestParams).resolvesOnce({
      service: {
        serviceArn:
          'arn:aws:ecs:us-east-1:012345678910:service/MyCluster/MyService',
        serviceName: 'MyService',
      },
    });

    const response = await handleCreate(
      {
        ...defaultEvent,
        RequestType: 'Create',
        ResourceProperties: {
          ...defaultEcsServiceResourceProperties,
          Tags: [
            { Key: 'foo', Value: 'bar' },
            { Key: 'k', Value: 'west' },
          ],
        },
      },
      defaultContext,
      defaultLogger
    );

    const ecsClientCalls = ecsClientMock.calls();

    expect(ecsClientCalls).toHaveLength(1);

    expect(response).toEqual({
      physicalResourceId:
        'arn:aws:ecs:us-east-1:012345678910:service/MyCluster/MyService',
      responseData: {
        ServiceName: 'MyService',
      },
    });
  });
});

describe('updateHandler', () => {
  test('sends data update request', async () => {
    const updateRequestParams = {
      service: 'foo',
      cluster: 'foo',
      desiredCount: 1,
      deploymentConfiguration: {},
      healthCheckGracePeriodSeconds: 3,
    };

    ecsClientMock.on(UpdateServiceCommand, updateRequestParams).resolves({
      service: {
        serviceArn:
          'arn:aws:ecs:us-east-1:012345678910:service/MyCluster/MyService',
        serviceName: 'MyService',
      },
    });

    const untagRequestParams = {
      resourceArn:
        'arn:aws:ecs:us-east-1:012345678910:service/MyCluster/MyService',
      tagKeys: ['foo'],
    };

    ecsClientMock.on(UntagResourceCommand, untagRequestParams).resolves({});

    const tagRequestParams = {
      resourceArn:
        'arn:aws:ecs:us-east-1:012345678910:service/MyCluster/MyService',
      tags: [
        { key: 'dis', value: 'dat' },
        { key: 'k', value: 'west' },
        { key: 'ye', value: 'west' },
      ],
    };

    ecsClientMock.on(TagResourceCommand, tagRequestParams).resolves({});

    await handleUpdate(
      {
        ...defaultEvent,
        RequestType: 'Update',
        PhysicalResourceId: 'foo',
        ResourceProperties: {
          ...defaultEcsServiceResourceProperties,
          Tags: [
            { Key: 'dis', Value: 'dat' },
            { Key: 'k', Value: 'west' },
            { Key: 'ye', Value: 'west' },
          ],
        },
        OldResourceProperties: {
          ...defaultEcsServiceResourceProperties,
          Tags: [
            { Key: 'foo', Value: 'bar' },
            { Key: 'k', Value: 'WEST' },
            { Key: 'ye', Value: 'west' },
          ],
        },
      },
      defaultContext,
      defaultLogger
    );

    const ecsClientCalls = ecsClientMock.calls();

    expect(ecsClientCalls).toHaveLength(3);
  });

  test('does not delete keys if no old keys are deleted', async () => {
    const updateRequestParams = {
      service: 'foo',
      cluster: 'foo',
      desiredCount: 1,
      deploymentConfiguration: {},
      healthCheckGracePeriodSeconds: 3,
    };

    ecsClientMock.on(UpdateServiceCommand, updateRequestParams).resolves({
      service: {
        serviceArn:
          'arn:aws:ecs:us-east-1:012345678910:service/MyCluster/MyService',
        serviceName: 'MyService',
      },
    });

    const tagRequestParams = {
      resourceArn:
        'arn:aws:ecs:us-east-1:012345678910:service/MyCluster/MyService',
      tags: [
        { key: 'dis', value: 'dat' },
        { key: 'k', value: 'west' },
        { key: 'ye', value: 'west' },
      ],
    };

    ecsClientMock.on(TagResourceCommand, tagRequestParams).resolves({});

    await handleUpdate(
      {
        ...defaultEvent,
        RequestType: 'Update',
        PhysicalResourceId: 'foo',
        ResourceProperties: {
          ...defaultEcsServiceResourceProperties,
          Tags: [
            { Key: 'dis', Value: 'dat' },
            { Key: 'k', Value: 'west' },
            { Key: 'ye', Value: 'west' },
          ],
        },
        OldResourceProperties: {
          ...defaultEcsServiceResourceProperties,
          Tags: [
            { Key: 'dis', Value: 'dat' },
            { Key: 'k', Value: 'west' },
            { Key: 'ye', Value: 'west' },
          ],
        },
      },
      defaultContext,
      defaultLogger
    );

    const ecsClientCalls = ecsClientMock.calls();

    expect(ecsClientCalls).toHaveLength(2);
  });

  test('does not delete or create keys if no old keys or new keys are present', async () => {
    const updateRequestParams = {
      service: 'foo',
      cluster: 'foo',
      desiredCount: 1,
      deploymentConfiguration: {},
      healthCheckGracePeriodSeconds: 3,
    };

    ecsClientMock.on(UpdateServiceCommand, updateRequestParams).resolves({
      service: {
        serviceArn:
          'arn:aws:ecs:us-east-1:012345678910:service/MyCluster/MyService',
        serviceName: 'MyService',
      },
    });

    await handleUpdate(
      {
        ...defaultEvent,
        RequestType: 'Update',
        PhysicalResourceId: 'foo',
        ResourceProperties: {
          ...defaultEcsServiceResourceProperties,
          Tags: [],
        },
        OldResourceProperties: {
          ...defaultEcsServiceResourceProperties,
          Tags: [],
        },
      },
      defaultContext,
      defaultLogger
    );

    const ecsClientCalls = ecsClientMock.calls();

    expect(ecsClientCalls).toHaveLength(1);
  });
});
