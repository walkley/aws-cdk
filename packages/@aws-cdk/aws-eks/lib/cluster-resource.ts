import cfn = require('@aws-cdk/aws-cloudformation');
import iam = require('@aws-cdk/aws-iam');
import { Construct, Token } from '@aws-cdk/core';
import { ClusterResourceProvider } from './cluster-resource-provider';
import { CfnClusterProps } from './eks.generated';

/**
 * A low-level CFN resource Amazon EKS cluster implemented through a custom
 * resource.
 *
 * Implements EKS create/update/delete through a CloudFormation custom resource
 * in order to allow us to control the IAM role which creates the cluster. This
 * is required in order to be able to allow CloudFormation to interact with the
 * cluster via `kubectl` to enable Kubernetes management capabilities like apply
 * manifest and IAM role/user RBAC mapping.
 */
export class ClusterResource extends Construct {
  /**
   * The AWS CloudFormation resource type used for this resource.
   */
  public static readonly RESOURCE_TYPE = 'Custom::AWSCDK-EKS-Cluster';

  public readonly attrEndpoint: string;
  public readonly attrArn: string;
  public readonly attrCertificateAuthorityData: string;
  public readonly ref: string;

  /**
   * The IAM role which created the cluster. Initially this is the only IAM role
   * that gets administrator privilages on the cluster (`system:masters`), and
   * will be able to issue `kubectl` commands against it.
   */
  public readonly creationRole: iam.IRole;

  constructor(scope: Construct, id: string, props: CfnClusterProps) {
    super(scope, id);

    const provider = ClusterResourceProvider.getOrCreate(this);

    if (!props.roleArn) {
      throw new Error(`"roleArn" is required`);
    }

    provider.allowPassRole(props.roleArn);

    const resource = new cfn.CustomResource(this, 'Resource', {
      resourceType: ClusterResource.RESOURCE_TYPE,
      provider: provider.provider,
      properties: {
        Config: props,
        // TODO: CreationRole:
        // currently, the role that creates the cluster is the one we use for the
        // provider lambda function but this is not good enough because it is shared
        // between all clusters in this stack (since the provider is a singleton).
      }
    });

    this.ref = resource.ref;
    this.attrEndpoint = Token.asString(resource.getAtt('Endpoint'));
    this.attrArn = Token.asString(resource.getAtt('Arn'));
    this.attrCertificateAuthorityData = Token.asString(resource.getAtt('CertificateAuthorityData'));
    this.creationRole = provider.role;
  }
}
