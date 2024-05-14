import {
  CodeDeployClient,
  CreateDeploymentGroupCommand,
  DeploymentOption,
  DeploymentReadyAction,
  DeploymentType,
  InstanceAction,
  TagResourceCommand,
  UntagResourceCommand,
  UpdateDeploymentGroupCommand,
} from '@aws-sdk/client-codedeploy';
import { mockClient } from 'aws-sdk-client-mock';

const codeDeployClientMock = mockClient(CodeDeployClient);

import {
  handleCreate,
  handleUpdate,
} from '../../../lambdas/ecs-deployment-group';
import { defaultContext } from '../__fixtures__/default-context';
import { defaultEvent } from '../__fixtures__/default-event';
import { defaultLogger } from '../__fixtures__/default-logger';

const defaultEcsDeploymentGroupProperties = {
  ApplicationName: 'TestApplicationName',
  DeploymentGroupName: 'TestDeploymentGroupName',
  ServiceRoleArn: 'arn:aws:iam::012345678910:role/MyRole',
  EcsServices: [
    {
      ServiceName: 'Foo',
      ClusterName: 'Foo',
    },
  ],
  TargetGroupNames: ['Foo'],
  ProdTrafficListenerArn:
    'arn:aws:elasticloadbalancing::012345678910:listener/app/MyApp/foo/prod',
  TestTrafficListenerArn:
    'arn:aws:elasticloadbalancing::012345678910:listener/app/MyApp/foo/test',
  TerminationWaitTimeInMinutes: 5,
};

afterEach(() => {
  codeDeployClientMock.reset();
});

describe('createHandler', () => {
  const requestParams = {
    applicationName: 'TestApplicationName',
    deploymentGroupName: 'TestDeploymentGroupName',
    serviceRoleArn: 'arn:aws:iam::012345678910:role/MyRole',
    ecsServices: [
      {
        serviceName: 'Foo',
        clusterName: 'Foo',
      },
    ],
    loadBalancerInfo: {
      targetGroupPairInfoList: [
        {
          prodTrafficRoute: {
            listenerArns: [
              'arn:aws:elasticloadbalancing::012345678910:listener/app/MyApp/foo/prod',
            ],
          },
          testTrafficRoute: {
            listenerArns: [
              'arn:aws:elasticloadbalancing::012345678910:listener/app/MyApp/foo/test',
            ],
          },
          targetGroups: [
            {
              name: 'Foo',
            },
          ],
        },
      ],
    },
    autoRollbackConfiguration: {
      enabled: false,
      events: undefined,
    },
    blueGreenDeploymentConfiguration: {
      terminateBlueInstancesOnDeploymentSuccess: {
        action: InstanceAction.TERMINATE,
        terminationWaitTimeInMinutes: 5,
      },
      deploymentReadyOption: {
        actionOnTimeout: DeploymentReadyAction.CONTINUE_DEPLOYMENT,
      },
    },
    deploymentStyle: {
      deploymentType: DeploymentType.BLUE_GREEN,
      deploymentOption: DeploymentOption.WITHOUT_TRAFFIC_CONTROL,
    },
    deploymentConfigName: 'CodeDeployDefault.ECSAllAtOnce',
    tags: [
      { Key: 'foo', Value: 'bar' },
      { Key: 'k', Value: 'west' },
    ],
  };

  codeDeployClientMock
    .on(CreateDeploymentGroupCommand, requestParams)
    .resolves({
      deploymentGroupId: '1',
    });

  test('sends tags with create request', async () => {
    await handleCreate(
      {
        ...defaultEvent,
        RequestType: 'Create',
        ResourceProperties: {
          ServiceToken: 'foo',
          ...defaultEcsDeploymentGroupProperties,
          Tags: [
            { Key: 'foo', Value: 'bar' },
            { Key: 'k', Value: 'west' },
          ],
        },
      },
      defaultContext,
      defaultLogger
    );

    const codeDeployClientCalls = codeDeployClientMock.calls();

    expect(codeDeployClientCalls).toHaveLength(1);
  });

  test('returns the physical id and arn of the deployment group', async () => {
    const response = await handleCreate(
      {
        ...defaultEvent,
        RequestType: 'Create',
        ResourceProperties: {
          ServiceToken: 'foo',
          ...defaultEcsDeploymentGroupProperties,
          Tags: [
            { Key: 'foo', Value: 'bar' },
            { Key: 'k', Value: 'west' },
          ],
        },
      },
      {
        ...defaultContext,
        invokedFunctionArn:
          'arn:aws:lambda:eu-west-1:012345678910:function:MyCustomResourceHandler',
      },
      defaultLogger
    );

    const codeDeployClientCalls = codeDeployClientMock.calls();

    expect(codeDeployClientCalls).toHaveLength(1);

    expect(response).toEqual(
      expect.objectContaining({
        physicalResourceId: 'TestDeploymentGroupName',
        responseData: {
          Arn: 'arn:aws:codedeploy:eu-west-1:012345678910:deploymentgroup:TestApplicationName/TestDeploymentGroupName',
        },
      })
    );
  });
});

describe('updateHandler', () => {
  const requestParams = {
    applicationName: 'TestApplicationName',
    currentDeploymentGroupName: 'TestDeploymentGroupName',
    newDeploymentGroupName: 'TestDeploymentGroupName',
    ecsServices: [
      {
        serviceName: 'Foo',
        clusterName: 'Foo',
      },
    ],
    loadBalancerInfo: {
      targetGroupPairInfoList: [
        {
          prodTrafficRoute: {
            listenerArns: [
              'arn:aws:elasticloadbalancing::012345678910:listener/app/MyApp/foo/prod',
            ],
          },
          testTrafficRoute: {
            listenerArns: [
              'arn:aws:elasticloadbalancing::012345678910:listener/app/MyApp/foo/test',
            ],
          },
          targetGroups: [
            {
              name: 'Foo',
            },
          ],
        },
      ],
    },
    autoRollbackConfiguration: {
      enabled: false,
      events: undefined,
    },
    blueGreenDeploymentConfiguration: {
      terminateBlueInstancesOnDeploymentSuccess: {
        action: InstanceAction.TERMINATE,
        terminationWaitTimeInMinutes: 5,
      },
      deploymentReadyOption: {
        actionOnTimeout: DeploymentReadyAction.CONTINUE_DEPLOYMENT,
      },
    },
    deploymentConfigName: 'CodeDeployDefault.ECSAllAtOnce',
  };

  codeDeployClientMock
    .on(UpdateDeploymentGroupCommand, requestParams)
    .resolves({
      hooksNotCleanedUp: [],
    });

  test('sends data update requests', async () => {
    const untagRequestParams = {
      ResourceArn:
        'arn:aws:codedeploy:eu-west-1:012345678910:deploymentgroup:TestApplicationName/TestDeploymentGroupName',
      TagKeys: ['foo'],
    };

    codeDeployClientMock
      .on(UntagResourceCommand, untagRequestParams)
      .resolves({});

    const tagRequestParams = {
      ResourceArn:
        'arn:aws:codedeploy:eu-west-1:012345678910:deploymentgroup:TestApplicationName/TestDeploymentGroupName',
      Tags: [
        { Key: 'dis', Value: 'dat' },
        { Key: 'k', Value: 'west' },
        { Key: 'ye', Value: 'west' },
      ],
    };

    codeDeployClientMock.on(TagResourceCommand, tagRequestParams).resolves({});

    await handleUpdate(
      {
        ...defaultEvent,
        RequestType: 'Update',
        PhysicalResourceId: 'foo',
        ResourceProperties: {
          ServiceToken: 'foo',
          ...defaultEcsDeploymentGroupProperties,
          Tags: [
            { Key: 'dis', Value: 'dat' },
            { Key: 'k', Value: 'west' },
            { Key: 'ye', Value: 'west' },
          ],
        },
        OldResourceProperties: {
          ServiceToken: 'foo',
          ...defaultEcsDeploymentGroupProperties,
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

    const codeDeployClientCalls = codeDeployClientMock.calls();

    expect(codeDeployClientCalls).toHaveLength(3);
  });

  test('returns the physical id and arn of the deployment group', async () => {
    const response = await handleUpdate(
      {
        ...defaultEvent,
        RequestType: 'Update',
        PhysicalResourceId: 'foo',
        ResourceProperties: {
          ...defaultEcsDeploymentGroupProperties,
          ServiceToken: 'foo',
        },
        OldResourceProperties: {
          ...defaultEcsDeploymentGroupProperties,
        },
      },
      {
        ...defaultContext,
        invokedFunctionArn:
          'arn:aws:lambda:us-east-1:012345678910:function:MyCustomResourceHandler',
      },
      defaultLogger
    );

    expect(response).toEqual(
      expect.objectContaining({
        physicalResourceId: 'TestDeploymentGroupName',
        responseData: {
          Arn: 'arn:aws:codedeploy:us-east-1:012345678910:deploymentgroup:TestApplicationName/TestDeploymentGroupName',
        },
      })
    );
  });
});
