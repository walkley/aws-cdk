import { Test } from 'nodeunit';
import { ClusterResourceHandler } from '../lib/cluster-resource-handler/handler';
import mocks = require('./cluster-resource-handler-mocks');

export = {
  setUp(callback: any) {
    mocks.reset();
    callback();
  },

  create: {
    async 'onCreate: minimal defaults (vpc + role)'(test: Test) {
      const handler = new ClusterResourceHandler(mocks.client, mocks.newRequest('Create', mocks.MOCK_PROPS));
      await handler.onCreate();

      test.deepEqual(mocks.createClusterRequest, {
        roleArn: 'arn:of:role',
        resourcesVpcConfig: {
          subnetIds: ['subnet1', 'subnet2'],
          securityGroupIds: ['sg1', 'sg2', 'sg3']
        },
        name: 'cluster-fake-request-id'
      });

      test.done();
    },

    async 'onCreate: explicit cluster name'(test: Test) {
      const handler = new ClusterResourceHandler(mocks.client, mocks.newRequest('Create', {
        ...mocks.MOCK_PROPS,
        name: 'ExplicitCustomName'
      }));
      await handler.onCreate();

      test.deepEqual(mocks.createClusterRequest!.name, 'ExplicitCustomName');
      test.done();
    },

    async 'with no specific version'(test: Test) {
      const handler = new ClusterResourceHandler(mocks.client, mocks.newRequest('Create', {
        ...mocks.MOCK_PROPS,
        version: '12.34.56',
      }));
      await handler.onCreate();

      test.deepEqual(mocks.createClusterRequest!.version, '12.34.56');
      test.done();
    },

    async 'isCreateComplete still not complete if cluster is not ACTIVE'(test: Test) {
      const handler = new ClusterResourceHandler(mocks.client, mocks.newRequest('Create'));
      mocks.describeClusterResponseMockStatus = 'CREATING';
      const resp = await handler.isCreateComplete();
      test.deepEqual(mocks.describeClusterRequest!.name, 'physical-resource-id');
      test.deepEqual(resp, { IsComplete: false });
      test.done();
    },

    async 'isCreateComplete is complete when cluster is ACTIVE'(test: Test) {
      const handler = new ClusterResourceHandler(mocks.client, mocks.newRequest('Create'));
      mocks.describeClusterResponseMockStatus = 'ACTIVE';
      const resp = await handler.isCreateComplete();
      test.deepEqual(resp, {
        IsComplete: true,
        Data: {
          Name: 'physical-resource-id',
          Endpoint: 'http://endpoint',
          Arn: 'arn:cluster-arn',
          CertificateAuthorityData: 'certificateAuthority-data'
        }
      });
      test.done();
    },

  },

  delete: {
    async 'returns correct physical name'(test: Test) {
      const handler = new ClusterResourceHandler(mocks.client, mocks.newRequest('Delete'));
      const resp = await handler.onDelete();
      test.deepEqual(mocks.deleteClusterRequest!.name, 'physical-resource-id');
      test.deepEqual(resp, { PhysicalResourceId: 'physical-resource-id' });
      test.done();
    },

    async 'onDelete ignores ResourceNotFoundException'(test: Test) {
      const handler = new ClusterResourceHandler(mocks.client, mocks.newRequest('Delete'));
      mocks.deleteClusterErrorCode = 'ResourceNotFoundException';
      await handler.onDelete();
      test.done();
    },

    async 'isDeleteComplete returns false as long as describeCluster succeeds'(test: Test) {
      const handler = new ClusterResourceHandler(mocks.client, mocks.newRequest('Delete'));
      const resp = await handler.isDeleteComplete();
      test.deepEqual(mocks.describeClusterRequest!.name, 'physical-resource-id');
      test.ok(!resp.IsComplete);
      test.done();
    },

    async 'isDeleteComplete returns true when describeCluster throws a ResourceNotFound exception'(test: Test) {
      const handler = new ClusterResourceHandler(mocks.client, mocks.newRequest('Delete'));
      mocks.describeClusterExceptionCode = 'ResourceNotFoundException';
      const resp = await handler.isDeleteComplete();
      test.ok(resp.IsComplete);
      test.done();
    },

    async 'isDeleteComplete propagates other errors'(test: Test) {
      const handler = new ClusterResourceHandler(mocks.client, mocks.newRequest('Delete'));
      mocks.describeClusterExceptionCode = 'OtherException';
      let error;
      try {
        await handler.isDeleteComplete();
      } catch (e) {
        error = e;
      }
      test.equal(error.code, 'OtherException');
      test.done();
    }
  },

  update: {

    async 'no change'(test: Test) {
      const handler = new ClusterResourceHandler(mocks.client, mocks.newRequest('Update', mocks.MOCK_PROPS, mocks.MOCK_PROPS));
      const resp = await handler.onUpdate();
      test.equal(resp, undefined);
      test.equal(mocks.createClusterRequest, undefined);
      test.equal(mocks.updateClusterConfigRequest, undefined);
      test.equal(mocks.updateClusterVersionRequest, undefined);
      test.done();
    },

    async 'isUpdateComplete is not complete when status is not ACTIVE'(test: Test) {
      const handler = new ClusterResourceHandler(mocks.client, mocks.newRequest('Update'));
      mocks.describeClusterResponseMockStatus = 'UPDATING';
      const resp = await handler.isUpdateComplete();
      test.deepEqual(resp.IsComplete, false);
      test.done();
    },

    async 'isUpdateComplete waits for ACTIVE'(test: Test) {
      const handler = new ClusterResourceHandler(mocks.client, mocks.newRequest('Update'));
      mocks.describeClusterResponseMockStatus = 'ACTIVE';
      const resp = await handler.isUpdateComplete();
      test.deepEqual(resp.IsComplete, true);
      test.done();
    },

    'requires replacement': {

      'name change': {

        async 'a new cluster is created with the new name and returned through PhysicalResourceId'(test: Test) {
          const handler = new ClusterResourceHandler(mocks.client, mocks.newRequest('Update', {
            ...mocks.MOCK_PROPS,
            name: 'new-cluster-name-1234'
          }));
          const resp = await handler.onUpdate();
          test.deepEqual(mocks.createClusterRequest!, {
            name: 'new-cluster-name-1234',
            roleArn: 'arn:of:role',
            resourcesVpcConfig:
            {
              subnetIds: ['subnet1', 'subnet2'],
              securityGroupIds: ['sg1', 'sg2', 'sg3']
            }
          });
          test.deepEqual(resp, { PhysicalResourceId: 'new-cluster-name-1234' });
          test.done();
        },

      },

      async 'subnets or security groups requires a replacement'(test: Test) {
        const handler = new ClusterResourceHandler(mocks.client, mocks.newRequest('Update', {
          ...mocks.MOCK_PROPS,
          resourcesVpcConfig: {
            subnetIds: ['subnet1', 'subnet2'],
            securityGroupIds: ['sg1']
          }
        }, {
          ...mocks.MOCK_PROPS,
          resourcesVpcConfig: {
            subnetIds: ['subnet1'],
            securityGroupIds: ['sg2']
          }
        }));
        const resp = await handler.onUpdate();

        test.deepEqual(resp, { PhysicalResourceId: 'cluster-fake-request-id' });
        test.deepEqual(mocks.createClusterRequest, {
          name: 'cluster-fake-request-id',
          roleArn: 'arn:of:role',
          resourcesVpcConfig:
          {
            subnetIds: ['subnet1', 'subnet2'],
            securityGroupIds: ['sg1']
          }
        });
        test.done();
      },

      async '"roleArn" requires a replcement'(test: Test) {
        const handler = new ClusterResourceHandler(mocks.client, mocks.newRequest('Update', {
          roleArn: 'new-arn'
        }, {
          roleArn: 'old-arn'
        }));
        const resp = await handler.onUpdate();

        test.deepEqual(resp, { PhysicalResourceId: 'cluster-fake-request-id' });
        test.deepEqual(mocks.createClusterRequest, {
          name: 'cluster-fake-request-id',
          roleArn: 'new-arn'
        });
        test.done();
      },

      async 'change of "roleArn" and "version"'(test: Test) {
        test.done();
      },
      async 'fails if cluster has an explicit "name"'(test: Test) {
        test.done();
      },
      async 'succeeds if cluster had an explicit "name" and now it does not'(test: Test) {
        test.done();
      },
      async 'succeeds if cluster had an explicit "name" and now it has a different name'(test: Test) {
        test.done();
      }
    },

    'in-place': {
      'version change': {
        async 'from undefined to a specific value'(test: Test) {
          const handler = new ClusterResourceHandler(mocks.client, mocks.newRequest('Update', {
            version: '12.34'
          }, {
            version: undefined
          }));
          const resp = await handler.onUpdate();
          test.equal(resp, undefined);
          test.deepEqual(mocks.updateClusterVersionRequest!, {
            name: 'physical-resource-id',
            version: '12.34'
          });
          test.equal(mocks.createClusterRequest, undefined);
          test.done();
        },

        async 'from a specific value to another value'(test: Test) {
          const handler = new ClusterResourceHandler(mocks.client, mocks.newRequest('Update', {
            version: '2.0'
          }, {
            version: '1.1'
          }));
          const resp = await handler.onUpdate();
          test.equal(resp, undefined);
          test.deepEqual(mocks.updateClusterVersionRequest!, {
            name: 'physical-resource-id',
            version: '2.0'
          });
          test.equal(mocks.createClusterRequest, undefined);
          test.done();
        },

        async 'to a new value that is already the current version'(test: Test) {
          const handler = new ClusterResourceHandler(mocks.client, mocks.newRequest('Update', {
            version: '1.0'
          }));
          const resp = await handler.onUpdate();
          test.equal(resp, undefined);
          test.deepEqual(mocks.describeClusterRequest, { name: 'physical-resource-id' });
          test.equal(mocks.updateClusterVersionRequest, undefined);
          test.equal(mocks.createClusterRequest, undefined);
          test.done();
        },

        async 'fails from specific value to undefined'(test: Test) {
          const handler = new ClusterResourceHandler(mocks.client, mocks.newRequest('Update', {
            version: undefined
          }, {
            version: '1.2'
          }));
          let error;
          try {
            await handler.onUpdate();
          } catch (e) {
            error = e;
          }

          test.equal(error.message, 'Cannot remove cluster version configuration. Current version is 1.2');
          test.done();
        }
      }
    },
  },

};