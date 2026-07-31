#!/usr/bin/env python3
"""Deploy voice-journal to Alibaba Cloud OSS static hosting."""
import os, sys, mimetypes

try:
    import oss2
except ImportError:
    print("Installing oss2...")
    os.system(f"{sys.executable} -m pip install oss2 -q")
    import oss2

# ===== CONFIG — fill in your credentials =====
ACCESS_KEY_ID = "YOUR_ACCESS_KEY_ID"
ACCESS_KEY_SECRET = "YOUR_ACCESS_KEY_SECRET"
REGION = "oss-cn-hangzhou"
BUCKET_NAME = "voice-journal-lzx"
LOCAL_DIR = r"C:\Users\lizhaoxia\Desktop\CC\voice-journal"

def main():
    if not ACCESS_KEY_ID or not ACCESS_KEY_SECRET:
        print("Please fill in ACCESS_KEY_ID and ACCESS_KEY_SECRET in the script.")
        sys.exit(1)

    auth = oss2.Auth(ACCESS_KEY_ID, ACCESS_KEY_SECRET)
    bucket = oss2.Bucket(auth, f"https://{REGION}.aliyuncs.com", BUCKET_NAME)

    # Step 1: Create bucket if not exists
    try:
        bucket.get_bucket_info()
        print(f"[OK] Bucket '{BUCKET_NAME}' already exists.")
    except oss2.exceptions.NoSuchBucket:
        bucket.create_bucket(oss2.BUCKET_ACL_PUBLIC_READ)
        print(f"[OK] Bucket '{BUCKET_NAME}' created with public-read ACL.")

    # Step 2: Enable static website hosting
    bucket.put_bucket_website(oss2.models.BucketWebsite('index.html', 'index.html'))
    print("[OK] Static website hosting enabled (index: index.html).")

    # Step 3: Upload all files
    mime_map = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
    }

    uploaded = 0
    for root, dirs, files in os.walk(LOCAL_DIR):
        dirs[:] = [d for d in dirs if d not in ('.git', '__pycache__')]
        for fn in files:
            if fn in ('deploy_oss.py',):
                continue
            local_path = os.path.join(root, fn)
            rel_path = os.path.relpath(local_path, LOCAL_DIR).replace('\\', '/')
            content_type = mime_map.get(os.path.splitext(fn)[1].lower(), 'application/octet-stream')
            with open(local_path, 'rb') as f:
                bucket.put_object(rel_path, f, headers={'Content-Type': content_type})
            uploaded += 1
            print(f"  Uploaded: {rel_path}")

    print(f"\n[OK] {uploaded} files uploaded.")
    print(f"\n{'='*60}")
    print(f"  Your site is live at:")
    print(f"  https://{BUCKET_NAME}.{REGION}.aliyuncs.com/index.html")
    print(f"{'='*60}")

if __name__ == '__main__':
    main()
