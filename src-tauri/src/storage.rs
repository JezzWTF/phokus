use std::path::{Path, PathBuf};
use sysinfo::{DiskKind, Disks};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StorageProfile {
    Fast,
    Balanced,
    Conservative,
}

#[derive(Debug, Clone, Copy)]
pub struct RuntimeAdaptiveProfile {
    profile: StorageProfile,
    ema_ms_per_item: Option<f64>,
}

impl StorageProfile {
    pub fn index_batch_size(self) -> usize {
        match self {
            StorageProfile::Fast => 300,
            StorageProfile::Balanced => 180,
            StorageProfile::Conservative => 90,
        }
    }

    pub fn worker_batch_size(self) -> usize {
        match self {
            StorageProfile::Fast => 16,
            StorageProfile::Balanced => 10,
            StorageProfile::Conservative => 6,
        }
    }

    pub fn worker_fetch_size(self) -> usize {
        match self {
            StorageProfile::Fast => 96,
            StorageProfile::Balanced => 48,
            StorageProfile::Conservative => 24,
        }
    }

    pub fn thumbnail_workers(self, available_parallelism: usize) -> usize {
        match self {
            StorageProfile::Fast => (available_parallelism / 3).clamp(2, 4),
            StorageProfile::Balanced => (available_parallelism / 4).clamp(2, 3),
            StorageProfile::Conservative => 1,
        }
    }
}

impl RuntimeAdaptiveProfile {
    pub fn new(initial_profile: StorageProfile) -> Self {
        Self {
            profile: initial_profile,
            ema_ms_per_item: None,
        }
    }

    pub fn profile(self) -> StorageProfile {
        self.profile
    }

    pub fn observe_scan_batch(&mut self, item_count: usize, elapsed: std::time::Duration) {
        if item_count == 0 {
            return;
        }

        let ms_per_item = elapsed.as_secs_f64() * 1000.0 / item_count as f64;
        self.ema_ms_per_item = Some(match self.ema_ms_per_item {
            Some(existing) => (existing * 0.7) + (ms_per_item * 0.3),
            None => ms_per_item,
        });

        let ema = self.ema_ms_per_item.unwrap_or(ms_per_item);
        self.profile = if ema >= 8.0 {
            StorageProfile::Conservative
        } else if ema >= 3.0 {
            StorageProfile::Balanced
        } else {
            StorageProfile::Fast
        };
    }
}

pub fn detect_storage_profile(path: &Path) -> StorageProfile {
    let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let disks = Disks::new_with_refreshed_list();

    let best_match = disks
        .list()
        .iter()
        .filter(|disk| canonical.starts_with(disk.mount_point()))
        .max_by_key(|disk| disk.mount_point().as_os_str().len());

    let Some(disk) = best_match else {
        return fallback_profile_for_path(&canonical);
    };

    if disk.is_removable() {
        return StorageProfile::Conservative;
    }

    match disk.kind() {
        DiskKind::SSD => StorageProfile::Fast,
        DiskKind::HDD => StorageProfile::Conservative,
        DiskKind::Unknown(_) => fallback_profile_for_path(&canonical),
    }
}

fn fallback_profile_for_path(path: &PathBuf) -> StorageProfile {
    let path_str = path.to_string_lossy().to_lowercase();
    if path_str.starts_with("\\\\") {
        return StorageProfile::Conservative;
    }

    if cfg!(target_os = "windows") {
        let drive = path_str.chars().next();
        if drive.is_some_and(|letter| !matches!(letter, 'c' | 'd')) {
            return StorageProfile::Balanced;
        }
    }

    StorageProfile::Balanced
}
