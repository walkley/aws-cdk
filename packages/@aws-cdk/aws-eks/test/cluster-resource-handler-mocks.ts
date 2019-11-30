import sdk = require('aws-sdk');
import { EksClient } from '../lib/cluster-resource-handler/handler';

export let createClusterRequest: sdk.EKS.CreateClusterRequest | undefined;
export let describeClusterRequest: sdk.EKS.DescribeClusterRequest | undefined;
export let deleteClusterRequest: sdk.EKS.DeleteClusterRequest | undefined;
export let updateClusterConfigRequest: sdk.EKS.UpdateClusterConfigRequest | undefined;
export let updateClusterVersionRequest: sdk.EKS.UpdateClusterVersionRequest | undefined;
export let describeClusterResponseMockStatus: string | undefined;
export let describeClusterExceptionCode: string | undefined;
export let deleteClusterErrorCode: string | undefined;

export function reset() {
  deleteClusterErrorCode = undefined;
  createClusterRequest = undefined;
  describeClusterRequest = undefined;
  deleteClusterRequest = undefined;
  updateClusterVersionRequest = undefined;
  updateClusterConfigRequest = undefined;
  describeClusterResponseMockStatus = undefined;
  describeClusterExceptionCode = undefined;
}

export const client: EksClient = {
  createCluster: async req => {
    createClusterRequest = req;
    return {
      cluster: {
        name: req.name,
        roleArn: req.roleArn,
        version: '1.0',
        arn: `arn:${req.name}`,
        certificateAuthority: { data: 'certificateAuthority-data' },
        status: 'CREATING'
      }
    };
  },

  deleteCluster: async req => {
    deleteClusterRequest = req;
    if (deleteClusterErrorCode) {
      const e = new Error('mock error');
      (e as any).code = deleteClusterErrorCode;
      throw e;
    }
    return {
      cluster: {
        name: req.name
      }
    };
  },

  describeCluster: async req => {
    describeClusterRequest = req;

    if (describeClusterExceptionCode) {
      const e = new Error('mock exception');
      (e as any).code = describeClusterExceptionCode;
      throw e;
    }

    return {
      cluster: {
        name: req.name,
        version: '1.0',
        roleArn: 'arn:role',
        arn: `arn:cluster-arn`,
        certificateAuthority: { data: 'certificateAuthority-data' },
        endpoint: 'http://endpoint',
        status: describeClusterResponseMockStatus || 'ACTIVE'
      }
    };
  },

  updateClusterConfig: async req => {
    updateClusterConfigRequest = req;
    return { };
  },

  updateClusterVersion: async req => {
    updateClusterVersionRequest = req;
    return { };
  }

};

export const MOCK_PROPS = {
  roleArn: 'arn:of:role',
  resourcesVpcConfig: {
    subnetIds: [ 'subnet1', 'subnet2' ],
    securityGroupIds: [ 'sg1', 'sg2', 'sg3' ]
  }
};

export function newRequest<T extends 'Create' | 'Update' | 'Delete'>(
    requestType: T,
    props?: Partial<sdk.EKS.CreateClusterRequest>,
    oldProps?: Partial<sdk.EKS.CreateClusterRequest>) {
  return {
    StackId: 'fake-stack-id',
    RequestId: 'fake-request-id',
    ResourceType: 'Custom::EKSCluster',
    ServiceToken: 'boom',
    LogicalResourceId: 'MyResourceId',
    PhysicalResourceId: 'physical-resource-id',
    ResponseURL: 'http://response-url',
    RequestType: requestType,
    OldResourceProperties: {
      Config: oldProps
    },
    ResourceProperties: {
      ServiceToken: 'boom',
      Config: props
    }
  };
}
