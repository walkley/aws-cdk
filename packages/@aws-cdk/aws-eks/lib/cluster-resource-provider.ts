import { NestedStack } from '@aws-cdk/aws-cloudformation';
import { PolicyStatement } from '@aws-cdk/aws-iam';
import lambda = require('@aws-cdk/aws-lambda');
import { Construct, Duration, Stack } from '@aws-cdk/core';
import cr = require('@aws-cdk/custom-resources');
import path = require('path');

const HANDLER_DIR = path.join(__dirname, 'cluster-resource-handler');
const HANDLER_RUNTIME = lambda.Runtime.NODEJS_12_X;

export class ClusterResourceProvider extends NestedStack {
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const uid = '@aws-cdk/aws-eks.ClusterResourceProvider';
    return stack.node.tryFindChild(uid) as ClusterResourceProvider || new ClusterResourceProvider(stack, uid);
  }

  public readonly provider: cr.Provider;

  private readonly onEvent: lambda.Function;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const onEvent = new lambda.Function(this, 'OnEventHandler', {
      code: lambda.Code.fromAsset(HANDLER_DIR),
      description: 'onEvent handler for EKS cluster resource provider',
      runtime: HANDLER_RUNTIME,
      handler: 'index.onEvent',
      timeout: Duration.minutes(1)
    });

    const isComplete = new lambda.Function(this, 'IsCompleteHandler', {
      code: lambda.Code.fromAsset(HANDLER_DIR),
      description: 'isComplete handler for EKS cluster resource provider',
      runtime: HANDLER_RUNTIME,
      handler: 'index.isComplete',
      timeout: Duration.minutes(1)
    });

    // since we don't know the cluster name at this point, we must give this role star resource permissions
    onEvent.addToRolePolicy(new PolicyStatement({
      actions: [ 'eks:CreateCluster', 'eks:DescribeCluster', 'eks:DeleteCluster', 'eks:UpdateClusterVersion', 'eks:UpdateClusterConfig' ],
      resources: [ '*' ]
    }));

    isComplete.addToRolePolicy(new PolicyStatement({
      actions: [ 'eks:DescribeCluster' ],
      resources: [ '*' ]
    }));

    this.provider = new cr.Provider(this, 'Provider', {
      onEventHandler: onEvent,
      isCompleteHandler: isComplete,
      totalTimeout: Duration.hours(1),
      queryInterval: Duration.minutes(1)
    });

    this.onEvent = onEvent;
  }

  public allowPassRole(roleArn: string) {
    // the CreateCluster API will allow the cluster to assume this role, so we
    // need to allow the lambda execution role to pass it.
    this.onEvent.addToRolePolicy(new PolicyStatement({
      actions: [ 'iam:PassRole' ],
      resources: [ roleArn ]
    }));
  }

  public get role() {
    return this.onEvent.role!;
  }
}