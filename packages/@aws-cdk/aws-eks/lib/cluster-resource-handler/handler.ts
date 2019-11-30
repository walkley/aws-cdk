// tslint:disable: max-line-length
// tslint:disable: no-console
import { IsCompleteRequest, IsCompleteResponse, OnEventResponse } from '@aws-cdk/custom-resources/lib/provider-framework/types';
import aws = require('aws-sdk');

export class ClusterResourceHandler {
  constructor(private readonly eks: EksClient) { }

  // ------
  // CREATE
  // ------

  public async onCreate(event: AWSLambda.CloudFormationCustomResourceCreateEvent): Promise<OnEventResponse> {
    const props = parseProps(event.ResourceProperties);
    props.name = props.name || generateClusterName(event.RequestId);
    console.log('createCluster:', JSON.stringify(props, undefined, 2));
    const resp = await this.eks.createCluster(props);
    return {
      PhysicalResourceId: resp.cluster!.name
    };
  }

  public async isCreateComplete(event: IsCompleteRequest) {
    return this.isActive(event);
  }

  // ------
  // DELETE
  // ------

  public async onDelete(event: AWSLambda.CloudFormationCustomResourceDeleteEvent): Promise<OnEventResponse> {
    const clusterName = event.PhysicalResourceId;
    console.log(`deleting cluster ${clusterName}`);
    try {
      await this.eks.deleteCluster({ name: clusterName });
    } catch (e) {
      if (e.code !== 'ResourceNotFoundException') {
        throw e;
      } else {
        console.log(`cluster ${clusterName} not found, idempotently succeeded`);
      }
    }
    return {
      PhysicalResourceId: event.PhysicalResourceId
    };
  }

  public async isDeleteComplete(event: IsCompleteRequest): Promise<IsCompleteResponse> {
    const clusterName = event.PhysicalResourceId!;
    console.log(`waiting for cluster ${clusterName} to be deleted`);

    try {
      const resp = await this.eks.describeCluster({ name: clusterName });
      console.log('describeCluster returned:', JSON.stringify(resp, undefined, 2));
    } catch (e) {
      if (e.code === 'ResourceNotFoundException') {
        console.log('received ResourceNotFoundException, this means the cluster has been deleted (or never existed)');
        return { IsComplete: true };
      }

      console.log('describeCluster error:', e);
      throw e;
    }

    return {
      IsComplete: false
    };
  }

  // ------
  // UPDATE
  // ------

  public async onUpdate(event: AWSLambda.CloudFormationCustomResourceUpdateEvent) {
    const oldProps = parseProps(event.OldResourceProperties);
    const newProps = parseProps(event.ResourceProperties);
    const updates = analyzeUpdate(oldProps, newProps);

    console.log(updates);

    // if there is an update that requires replacement, go ahead and just create
    // a new cluster with the new config. The old cluster will automatically be
    // deleted by cloudformation upon success.
    if (updates.replaceName || updates.replaceRole || updates.replaceVpc) {
      return await this.onCreate({ ...event, RequestType: 'Create' });
    }

    // if a version update is required, issue the version update
    if (updates.updateVersion) {
      if (!newProps.version) {
        throw new Error(`Cannot remove cluster version configuration. Current version is ${oldProps.version}`);
      }

      await this.updateClusterVersion(event.PhysicalResourceId, newProps.version);
    }

    if (updates.updateLogging || updates.updateAccess) {
      return await this.eks.updateClusterConfig({
        name: event.PhysicalResourceId,
        logging: newProps.logging,
        resourcesVpcConfig: newProps.resourcesVpcConfig
      });
    }

    // no updates
    return;
  }

  public async isUpdateComplete(event: IsCompleteRequest) {
    return this.isActive(event);
  }

  private async updateClusterVersion(clusterName: string, newVersion: string) {
    // update-cluster-version will fail if we try to update to the same version,
    // so skip in this case.
    const cluster = (await this.eks.describeCluster({ name: clusterName })).cluster!;
    if (cluster.version === newVersion) {
      console.log(`cluster already at version ${cluster.version}, skipping version update`);
      return;
    }

    await this.eks.updateClusterVersion({ name: clusterName, version: newVersion });
  }

  private async isActive(event: IsCompleteRequest): Promise<IsCompleteResponse> {
    console.log('waiting for cluster to become ACTIVE');
    const resp = await this.eks.describeCluster({ name: event.PhysicalResourceId! });
    console.log('describeCluster result:', JSON.stringify(resp, undefined, 2));
    const cluster = resp.cluster!;
    if (cluster.status !== 'ACTIVE') {
      return { IsComplete: false };
    }

    return {
      IsComplete: true,
      Data: {
        Name: cluster.name,
        Endpoint: cluster.endpoint,
        Arn: cluster.arn,
        CertificateAuthorityData: cluster.certificateAuthority && cluster.certificateAuthority.data
      }
    };
  }
}

export interface EksClient {
  createCluster(request: aws.EKS.CreateClusterRequest): Promise<aws.EKS.CreateClusterResponse>;
  deleteCluster(request: aws.EKS.DeleteClusterRequest): Promise<aws.EKS.DeleteClusterResponse>;
  describeCluster(request: aws.EKS.DescribeClusterRequest): Promise<aws.EKS.DescribeClusterResponse>;
  updateClusterConfig(request: aws.EKS.UpdateClusterConfigRequest): Promise<aws.EKS.UpdateClusterConfigResponse>;
  updateClusterVersion(request: aws.EKS.UpdateClusterVersionRequest): Promise<aws.EKS.UpdateClusterVersionResponse>;
}

function parseProps(props: any): aws.EKS.CreateClusterRequest {
  return (props && props.Config) || { };
}

interface UpdateMap {
  replaceName: boolean;     // name
  replaceVpc: boolean;      // resourcesVpcConfig.subnetIds and securityGroupIds
  replaceRole: boolean;     // roleArn
  updateVersion: boolean;   // version
  updateLogging: boolean;   // logging
  updateAccess: boolean;    // resourcesVpcConfig.endpointPrivateAccess and endpointPublicAccess
}

function analyzeUpdate(oldProps: aws.EKS.CreateClusterRequest, newProps: aws.EKS.CreateClusterRequest): UpdateMap {
  console.log('old props: ', JSON.stringify(oldProps));
  console.log('new props: ', JSON.stringify(newProps));

  const newVpcProps = newProps.resourcesVpcConfig || { };
  const oldVpcProps = oldProps.resourcesVpcConfig || { };

  return {
    replaceName: newProps.name !== oldProps.name,
    replaceVpc:
      JSON.stringify(newVpcProps.subnetIds) !== JSON.stringify(oldVpcProps.subnetIds) ||
      JSON.stringify(newVpcProps.securityGroupIds) !== JSON.stringify(oldVpcProps.securityGroupIds),
    updateAccess:
      newVpcProps.endpointPrivateAccess !== oldVpcProps.endpointPrivateAccess ||
      newVpcProps.endpointPublicAccess !== oldVpcProps.endpointPublicAccess,
    replaceRole: newProps.roleArn !== oldProps.roleArn,
    updateVersion: newProps.version !== oldProps.version,
    updateLogging: JSON.stringify(newProps.logging) !== JSON.stringify(oldProps.logging),
  };
}

function generateClusterName(requestId: string) {
  return `cluster-${requestId}`;
}