// Storage preparation helpers for employee docs, bills, payroll exports, and photos.
(function (global) {
    const BUCKETS = {
        EMPLOYEE_DOCS: 'employee-docs',
        EXPENSE_ATTACHMENTS: 'expense-attachments',
        PAYROLL_EXPORTS: 'payroll-exports',
        PROFILE_PHOTOS: 'profile-photos'
    };

    const LIMITS = {
        'employee-docs': { maxBytes: 10 * 1024 * 1024, types: ['application/pdf', 'image/jpeg', 'image/png'] },
        'expense-attachments': { maxBytes: 8 * 1024 * 1024, types: ['application/pdf', 'image/jpeg', 'image/png'] },
        'payroll-exports': { maxBytes: 10 * 1024 * 1024, types: ['application/pdf', 'text/csv', 'application/json'] },
        'profile-photos': { maxBytes: 3 * 1024 * 1024, types: ['image/jpeg', 'image/png', 'image/webp'] }
    };

    function client() {
        return global.supabaseClientService?.getClient?.() || null;
    }

    function isStorageEnabled() {
        const cfg = global.supabaseClientService?.readConfig?.();
        return !!(cfg?.flags?.USE_SUPABASE_STORAGE && client());
    }

    function safeFileName(name) {
        const fallback = `file-${Date.now()}`;
        return String(name || fallback)
            .trim()
            .replace(/\\/g, '/')
            .split('/')
            .pop()
            .replace(/[^a-zA-Z0-9._-]/g, '-')
            .replace(/-+/g, '-')
            .slice(0, 120) || fallback;
    }

    function buildPath(empId, fileName, prefix = '') {
        const tenant = global.rbacEnforcementService?.resolveTenant?.();
        if (!tenant) throw new Error('A trusted tenant claim is required for storage paths.');
        const id = String(empId || 'unassigned').trim().replace(/[^a-zA-Z0-9._-]/g, '-');
        const parts = [tenant, id, prefix, safeFileName(fileName)].filter(Boolean);
        return parts.join('/');
    }

    function tenantScopedPath(path) {
        const tenant = global.rbacEnforcementService?.resolveTenant?.();
        if (!tenant) throw new Error('A trusted tenant claim is required for storage paths.');
        const clean = String(path || '').replace(/^\/+/, '');
        return clean.startsWith(tenant + '/') ? clean : tenant + '/' + clean;
    }

    function validateFile(bucket, file) {
        const limits = LIMITS[bucket];
        const errors = [];
        if (!limits) errors.push('Unknown storage bucket');
        if (!file) errors.push('File is required');
        if (file && limits) {
            if (file.size > limits.maxBytes) errors.push(`File exceeds ${Math.round(limits.maxBytes / 1024 / 1024)} MB limit`);
            if (file.type && !limits.types.includes(file.type)) errors.push(`File type ${file.type} is not allowed`);
        }
        return { ok: errors.length === 0, errors };
    }

    function requireStorageAccess(action, path) {
        if (!global.rbacEnforcementService?.requireAccess) throw new Error('RBAC enforcement service is unavailable.');
        const targetEmployeeId = String(path || '').split('/')[1] || '';
        return global.rbacEnforcementService.requireAccess({
            resource: 'storage',
            action,
            targetEmployeeId,
            actor: global.authService?.getCurrentUser?.() || null
        });
    }

    async function uploadFile(bucket, path, file, options = {}) {
        const scopedPath = tenantScopedPath(path);
        requireStorageAccess('create', scopedPath);
        const validation = validateFile(bucket, file);
        if (!validation.ok) return { ok: false, errors: validation.errors };
        if (!isStorageEnabled()) {
            return {
                ok: true,
                mode: 'local-placeholder',
                bucket,
                path: scopedPath,
                fileName: file.name,
                message: 'Storage is prepared; live upload is disabled by feature flag.'
            };
        }
        const operation = client().storage.from(bucket).upload(scopedPath, file, {
            cacheControl: options.cacheControl || '3600',
            upsert: options.upsert === true
        });
        const result = await global.errorService?.safeAsync?.(operation, {
            label: 'Storage upload',
            module: 'storage',
            action: 'uploadFile',
            message: 'Upload failed. Please retry.'
        }) || await operation;
        if (result?.error) return { ok: false, error: result.error.message || String(result.error) };
        return { ok: true, bucket, path: scopedPath, data: result.data };
    }

    async function createSignedUrl(bucket, path, expiresIn = 3600) {
        const scopedPath = tenantScopedPath(path);
        requireStorageAccess('read', scopedPath);
        if (!isStorageEnabled()) return { ok: false, reason: 'Storage disabled' };
        const result = await client().storage.from(bucket).createSignedUrl(scopedPath, expiresIn);
        if (result.error) return { ok: false, error: result.error.message };
        return { ok: true, url: result.data?.signedUrl || '' };
    }

    async function downloadFile(bucket, path, fileName, expiresIn = 60) {
        const signed = await createSignedUrl(bucket, path, expiresIn);
        if (!signed.ok || !signed.url) return signed;
        if (!global.document?.createElement) return signed;

        const anchor = global.document.createElement('a');
        const safeAttribute = global.FrontendSecurityService?.setSafeAttribute;
        const safeUrl = safeAttribute
            ? safeAttribute(anchor, 'href', signed.url)
            : /^https:\/\//i.test(signed.url) && (anchor.href = signed.url);
        if (!safeUrl) return { ok: false, error: 'Unsafe download URL was blocked.' };

        anchor.download = safeFileName(fileName);
        anchor.rel = 'noopener noreferrer';
        anchor.style.display = 'none';
        global.document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        return signed;
    }

    async function removeFile(bucket, path) {
        const scopedPath = tenantScopedPath(path);
        requireStorageAccess('delete', scopedPath);
        if (!isStorageEnabled()) return { ok: true, mode: 'local-placeholder', bucket, path: scopedPath };
        const operation = client().storage.from(bucket).remove([scopedPath]);
        const result = await global.errorService?.safeAsync?.(operation, {
            label: 'Storage delete',
            module: 'storage',
            action: 'removeFile',
            message: 'File deletion failed. Please retry.'
        }) || await operation;
        if (result?.error) return { ok: false, error: result.error.message || String(result.error) };
        return { ok: true, bucket, path: scopedPath, data: result.data };
    }

    function hasStoredFile(record) {
        return !!(record?.storageBucket && record?.storagePath);
    }

    function getStoragePlan() {
        return Object.entries(BUCKETS).map(([key, bucket]) => ({
            key,
            bucket,
            private: true,
            maxMB: Math.round((LIMITS[bucket]?.maxBytes || 0) / 1024 / 1024),
            allowedTypes: LIMITS[bucket]?.types || []
        }));
    }

    global.storageService = {
        BUCKETS,
        LIMITS,
        isStorageEnabled,
        safeFileName,
        buildPath,
        validateFile,
        uploadFile,
        createSignedUrl,
        downloadFile,
        removeFile,
        hasStoredFile,
        getStoragePlan
    };
})(typeof window !== 'undefined' ? window : globalThis);
