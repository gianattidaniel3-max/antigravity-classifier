import os
import shutil
from typing import BinaryIO
from minio import Minio

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT")
MINIO_ACCESS_KEY = os.getenv("MINIO_ROOT_USER", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_ROOT_PASSWORD", "minioadminpassword")
SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"

class StorageClient:
    def bucket_exists(self, bucket: str) -> bool: pass
    def make_bucket(self, bucket: str): pass
    def put_object(self, bucket: str, object_name: str, data: BinaryIO, length: int, content_type: str = "application/octet-stream"): pass
    def get_object(self, bucket: str, object_name: str): pass
    def remove_object(self, bucket: str, object_name: str): pass

class MinIOStorage(StorageClient):
    def __init__(self):
        self.client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=SECURE
        )
    def bucket_exists(self, bucket): return self.client.bucket_exists(bucket)
    def make_bucket(self, bucket): self.client.make_bucket(bucket)
    def put_object(self, bucket, object_name, data, length, content_type="application/octet-stream"):
        self.client.put_object(bucket, object_name, data, length, content_type)
    def get_object(self, bucket, object_name): return self.client.get_object(bucket, object_name)
    def remove_object(self, bucket, object_name): self.client.remove_object(bucket, object_name)

class LocalStorage(StorageClient):
    def __init__(self, base_dir="data"):
        self.base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", base_dir))
        if not os.path.exists(self.base_dir):
            os.makedirs(self.base_dir)

    def _path(self, bucket, object_name):
        return os.path.join(self.base_dir, bucket, object_name)

    def bucket_exists(self, bucket):
        return os.path.exists(os.path.join(self.base_dir, bucket))

    def make_bucket(self, bucket):
        os.makedirs(os.path.join(self.base_dir, bucket), exist_ok=True)

    def put_object(self, bucket, object_name, data, length, content_type="application/octet-stream"):
        path = self._path(bucket, object_name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            if hasattr(data, "read"):
                # Use a loop to avoid loading entire file into memory at once
                while True:
                    chunk = data.read(1024 * 64)
                    if not chunk:
                        break
                    f.write(chunk)
            else:
                f.write(data)

    def get_object(self, bucket, object_name):
        path = self._path(bucket, object_name)
        if not os.path.exists(path):
            raise Exception(f"Object {object_name} not found in {bucket}")
        f = open(path, "rb")
        # Add no-op release_conn for API compatibility
        setattr(f, "release_conn", lambda: None)
        return f

    def remove_object(self, bucket, object_name):
        path = self._path(bucket, object_name)
        if os.path.exists(path):
            os.remove(path)

# Auto-selection
if MINIO_ENDPOINT:
    try:
        client = MinIOStorage()
        print("Using MinIO Storage")
    except Exception as e:
        print(f"Failed to connect to MinIO, falling back to LocalStorage: {e}")
        client = LocalStorage()
else:
    print("Using Local Filesystem Storage")
    client = LocalStorage()

def ensure_buckets():
    for bucket in ("documents", "ocr-text", "splits-temp"):
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)
