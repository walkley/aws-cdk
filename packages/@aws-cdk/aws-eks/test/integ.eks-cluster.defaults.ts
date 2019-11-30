import cdk = require('@aws-cdk/core');
import { CfnOutput } from '@aws-cdk/core';
import eks = require('../lib');
import { TestStack } from './util';

class EksClusterStack extends TestStack {
  constructor(scope: cdk.App, id: string) {
    super(scope, id);

    const cluster = new eks.Cluster(this, 'Cluster');

    new CfnOutput(this, 'ClusterEndpoint', { value: cluster.clusterEndpoint });
    new CfnOutput(this, 'ClusterArn', { value: cluster.clusterArn });
    new CfnOutput(this, 'ClusterCertificateAuthorityData', { value: cluster.clusterCertificateAuthorityData });
    new CfnOutput(this, 'ClusterName', { value: cluster.clusterName });
  }
}

const app = new cdk.App();

// since the EKS optimized AMI is hard-coded here based on the region,
// we need to actually pass in a specific region.
new EksClusterStack(app, 'eks-integ-defaults-2');

app.synth();