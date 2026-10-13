export interface StorageStatus {
  isPersisted: boolean;
  canPersist: boolean;
  quotaBytes?: number | undefined;
  usageBytes?: number | undefined;
}

export async function checkAndRequestStoragePersistence(): Promise<StorageStatus> {
  const canPersist = typeof navigator !== 'undefined' && 'storage' in navigator && 'persist' in navigator.storage;
  
  if (!canPersist) {
    return { isPersisted: false, canPersist: false };
  }

  try {
    let isPersisted = await navigator.storage.persisted();
    if (!isPersisted) {
      isPersisted = await navigator.storage.persist();
    }

    let quotaBytes: number | undefined;
    let usageBytes: number | undefined;

    if ('estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      quotaBytes = estimate.quota;
      usageBytes = estimate.usage;
    }

    return {
      isPersisted,
      canPersist: true,
      quotaBytes,
      usageBytes,
    };
  } catch (err) {
    console.error('Storage persistence check failed:', err);
    return { isPersisted: false, canPersist: true };
  }
}
