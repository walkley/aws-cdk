import { IsCompleteResponse } from '@aws-cdk/custom-resources/lib/provider-framework/types';
import aws = require('aws-sdk');
import { ClusterResourceHandler, EksClient } from './handler';

const eks = new aws.EKS();

const defaultEksClient: EksClient = {
  createCluster: req => eks.createCluster(req).promise(),
  deleteCluster: req => eks.deleteCluster(req).promise(),
  describeCluster: req => eks.describeCluster(req).promise(),
  updateClusterConfig: req => eks.updateClusterConfig(req).promise(),
  updateClusterVersion: req => eks.updateClusterVersion(req).promise(),
  configureAssumeRole: req => {
    aws.config.credentials = new aws.ChainableTemporaryCredentials({
      params: req
    });
  }
};

export async function onEvent(event: AWSLambda.CloudFormationCustomResourceEvent) {
  const provider = new ClusterResourceHandler(defaultEksClient, event);
  switch (event.RequestType) {
    case 'Create': return provider.onCreate();
    case 'Update': return provider.onUpdate();
    case 'Delete': return provider.onDelete();
  }
}

export async function isComplete(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<IsCompleteResponse> {
  const provider = new ClusterResourceHandler(defaultEksClient, event);
  switch (event.RequestType) {
    case 'Create': return provider.isCreateComplete();
    case 'Update': return provider.isUpdateComplete();
    case 'Delete': return provider.isDeleteComplete();
  }
}
