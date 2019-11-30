import { IsCompleteRequest, IsCompleteResponse } from '@aws-cdk/custom-resources/lib/provider-framework/types';
import aws = require('aws-sdk');
import { ClusterResourceHandler, EksClient } from './handler';

const eks = new aws.EKS();

const defaultEksClient: EksClient = {
  createCluster: req => eks.createCluster(req).promise(),
  deleteCluster: req => eks.deleteCluster(req).promise(),
  describeCluster: req => eks.describeCluster(req).promise(),
  updateClusterConfig: req => eks.updateClusterConfig(req).promise(),
  updateClusterVersion: req => eks.updateClusterVersion(req).promise(),
};

export async function onEvent(event: AWSLambda.CloudFormationCustomResourceEvent) {
  const provider = new ClusterResourceHandler(defaultEksClient);
  switch (event.RequestType) {
    case 'Create': return provider.onCreate(event);
    case 'Update': return provider.onUpdate(event);
    case 'Delete': return provider.onDelete(event);
  }
}

export async function isComplete(event: IsCompleteRequest): Promise<IsCompleteResponse> {
  const provider = new ClusterResourceHandler(defaultEksClient);
  switch (event.RequestType) {
    case 'Create': return provider.isCreateComplete(event);
    case 'Update': return provider.isUpdateComplete(event);
    case 'Delete': return provider.isDeleteComplete(event);
  }
}
