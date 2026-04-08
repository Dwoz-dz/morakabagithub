import { getSupabaseClient, isSupabaseConfigured } from "./client";

export type StorageBucketName =
  | "weapon-checks"
  | "fuel-bon"
  | "profile-avatars"
  | "vehicle-images"
  | "announcements-media"
  | "app-updates-apk";

interface UploadFileInput {
  bucket: StorageBucketName;
  userId: string;
  fileUri: string;
  fileName: string;
  contentType?: string;
  filePath?: string;
  upsert?: boolean;
}

interface UploadResult {
  path: string | null;
  error: string | null;
}

interface SignedUrlResult {
  url: string | null;
  error: string | null;
}

const isDirectUrl = (value: string): boolean =>
  /^https?:\/\//i.test(value) || value.startsWith("data:");

const sanitizeStorageSegment = (value: string): string =>
  value.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");

const buildStoragePath = ({
  userId,
  fileName,
  prefix,
}: {
  userId: string;
  fileName: string;
  prefix?: string;
}): string => {
  const safeName = fileName.replace(/\s+/g, "_");
  const leading = prefix ? `${prefix}/` : "";
  return `${userId}/${leading}${Date.now()}-${safeName}`;
};

const normalizeFilePath = (value: string): string =>
  value.trim().replace(/\\/g, "/").replace(/^\/+/, "");

export const buildUpdateApkStoragePath = ({
  userId,
  version,
}: {
  userId: string;
  version: string;
}): string => {
  const safeVersion = sanitizeStorageSegment(version || "draft");
  return `${userId}/app-updates/${safeVersion}/release.apk`;
};

const resolveUploadPath = ({
  userId,
  fileName,
  filePath,
}: {
  userId: string;
  fileName: string;
  filePath?: string;
}): string => {
  if (filePath && filePath.trim()) {
    const normalized = normalizeFilePath(filePath);
    if (!normalized.startsWith(`${userId}/`)) {
      return `${userId}/${normalized}`;
    }

    return normalized;
  }

  return buildStoragePath({ userId, fileName });
};

export const uploadFileToBucket = async ({
  bucket,
  userId,
  fileUri,
  fileName,
  contentType,
  filePath,
  upsert = false,
}: UploadFileInput): Promise<UploadResult> => {
  if (!isSupabaseConfigured) {
    return { path: null, error: "Supabase is not configured." };
  }

  try {
    const response = await fetch(fileUri);
    const fileBuffer = await response.arrayBuffer();
    const path = resolveUploadPath({ userId, fileName, filePath });

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage.from(bucket).upload(path, fileBuffer, {
      contentType,
      upsert,
    });

    if (error) {
      return { path: null, error: error.message };
    }

    return { path: data.path, error: null };
  } catch (error) {
    return { path: null, error: error instanceof Error ? error.message : "Failed to upload file." };
  }
};

export const uploadUpdateApkFile = async ({
  userId,
  fileUri,
  version,
  contentType,
}: {
  userId: string;
  fileUri: string;
  version: string;
  contentType?: string;
}): Promise<UploadResult> =>
  uploadFileToBucket({
    bucket: "app-updates-apk",
    userId,
    fileUri,
    fileName: `morakaba-${sanitizeStorageSegment(version || "draft")}.apk`,
    contentType: contentType ?? "application/vnd.android.package-archive",
    filePath: buildUpdateApkStoragePath({ userId, version }),
    upsert: true,
  });

export const uploadDataUrlToBucket = async ({
  bucket,
  userId,
  dataUrl,
  fileName,
  contentType,
  filePath,
  upsert = false,
}: {
  bucket: StorageBucketName;
  userId: string;
  dataUrl: string;
  fileName: string;
  contentType?: string;
  filePath?: string;
  upsert?: boolean;
}): Promise<UploadResult> => {
  if (!isSupabaseConfigured) {
    return { path: null, error: "Supabase is not configured." };
  }

  if (!dataUrl.startsWith("data:")) {
    return { path: null, error: "Invalid signature data format." };
  }

  try {
    const response = await fetch(dataUrl);
    const fileBuffer = await response.arrayBuffer();
    const path = resolveUploadPath({ userId, fileName, filePath });

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage.from(bucket).upload(path, fileBuffer, {
      contentType,
      upsert,
    });

    if (error) {
      return { path: null, error: error.message };
    }

    return { path: data.path, error: null };
  } catch (error) {
    return { path: null, error: error instanceof Error ? error.message : "Failed to upload base64 file." };
  }
};

export const deleteStorageObjectsFromBucket = async ({
  bucket,
  paths,
}: {
  bucket: StorageBucketName;
  paths: string[];
}): Promise<{ deletedCount: number; error: string | null }> => {
  if (!isSupabaseConfigured) {
    return { deletedCount: 0, error: "Supabase is not configured." };
  }

  const uniquePaths = Array.from(
    new Set(
      paths
        .map((item) => normalizeFilePath(item))
        .filter((item) => Boolean(item)),
    ),
  );

  if (!uniquePaths.length) {
    return { deletedCount: 0, error: null };
  }

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.storage.from(bucket).remove(uniquePaths);
    if (error) {
      return { deletedCount: 0, error: error.message };
    }

    return { deletedCount: uniquePaths.length, error: null };
  } catch (error) {
    return {
      deletedCount: 0,
      error: error instanceof Error ? error.message : "Failed to delete storage objects.",
    };
  }
};

export const createSignedStorageUrl = async ({
  bucket,
  path,
  expiresIn = 3600,
}: {
  bucket: StorageBucketName;
  path: string;
  expiresIn?: number;
}): Promise<SignedUrlResult> => {
  if (!isSupabaseConfigured) {
    return { url: null, error: "Supabase is not configured." };
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (error) {
      return { url: null, error: error.message };
    }

    return { url: data.signedUrl, error: null };
  } catch (error) {
    return { url: null, error: error instanceof Error ? error.message : "Failed to create URL." };
  }
};

export const resolveStoragePathOrUrl = async ({
  bucket,
  pathOrUrl,
  expiresIn = 3600,
}: {
  bucket: StorageBucketName;
  pathOrUrl: string | null | undefined;
  expiresIn?: number;
}): Promise<SignedUrlResult> => {
  if (!pathOrUrl) {
    return { url: null, error: null };
  }

  if (isDirectUrl(pathOrUrl)) {
    return { url: pathOrUrl, error: null };
  }

  return createSignedStorageUrl({
    bucket,
    path: pathOrUrl,
    expiresIn,
  });
};

export const uploadWeaponCheckFile = async ({
  userId,
  fileUri,
  fileName,
  contentType,
}: {
  userId: string;
  fileUri: string;
  fileName: string;
  contentType?: string;
}): Promise<UploadResult> =>
  uploadFileToBucket({
    bucket: "weapon-checks",
    userId,
    fileUri,
    fileName,
    contentType,
  });

export const uploadAnnouncementMediaFile = async ({
  userId,
  fileUri,
  fileName,
  contentType,
}: {
  userId: string;
  fileUri: string;
  fileName: string;
  contentType?: string;
}): Promise<UploadResult> =>
  uploadFileToBucket({
    bucket: "announcements-media",
    userId,
    fileUri,
    fileName,
    contentType,
  });
