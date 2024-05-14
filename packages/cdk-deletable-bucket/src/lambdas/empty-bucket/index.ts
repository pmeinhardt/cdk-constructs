import { DeleteObjectsCommand, ListObjectVersionsCommand, ObjectIdentifier, S3Client } from '@aws-sdk/client-s3';
import type { CloudFormationCustomResourceEvent, CloudFormationCustomResourceDeleteEvent } from 'aws-lambda';

export interface EcsTaskDefinitionProps {
  bucketName: string;
}

const s3 = new S3Client();

const getProperties = (
  props: CloudFormationCustomResourceDeleteEvent['ResourceProperties'],
): EcsTaskDefinitionProps => ({
  bucketName: props.BucketName,
});

const emptyBucket = async (bucketName: string): Promise<void> => {
  const listedObjects = await s3.send(
    new ListObjectVersionsCommand({
      Bucket: bucketName,
    }),
  );

  const deletableObjects = new Array<ObjectIdentifier>();

  listedObjects.Versions?.forEach((version) => {
    deletableObjects.push({
      Key: version.Key as string,
      VersionId: version.VersionId,
    });
  });

  listedObjects.DeleteMarkers?.forEach((marker) => {
    deletableObjects.push({
      Key: marker.Key as string,
      VersionId: marker.VersionId,
    });
  });

  if (deletableObjects.length === 0) return;

  await s3.send(
    new DeleteObjectsCommand({
      Bucket: bucketName,
      Delete: { Objects: deletableObjects },
    }),
  );

  if (listedObjects.IsTruncated) await emptyBucket(bucketName);
};

const onDelete = async (event: CloudFormationCustomResourceDeleteEvent): Promise<void> => {
  const { bucketName } = getProperties(event.ResourceProperties);

  await emptyBucket(bucketName);
};

export const handler = async (event: CloudFormationCustomResourceEvent): Promise<void> => {
  const requestType = event.RequestType;

  if (requestType === 'Delete') {
    return onDelete(event);
  }
};
