/**
 * Frontend security boundary for dynamic rendering, downloads, and local files.
 * Business values are treated as text unless a caller explicitly supplies markup,
 * and that markup is sanitized before it reaches a DOM parsing sink.
 */
(function attachFrontendSecurityService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var MAX_TEXT_LENGTH = 250000;
    var BLOCKED_ELEMENTS = new Set([
        'script', 'iframe', 'object', 'embed', 'base', 'meta', 'link', 'style',
        'template', 'noscript', 'applet', 'frame', 'frameset', 'math', 'foreignobject'
    ]);
    var URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'poster', 'background', 'xlink:href']);
    var ALLOWED_EVENT_ATTRIBUTES = new Set(['onclick', 'onchange', 'oninput', 'onsubmit']);
    var BLOCKED_HANDLER_TOKENS = /(?:^|[^\w$])(alert|confirm|prompt|eval|function|constructor|prototype|__proto__|fetch|xmlhttprequest|websocket|document|window|location|localstorage|sessionstorage|indexeddb|import|settimeout|setinterval)(?:[^\w$]|$)/i;
    var SCRIPTABLE_SCHEME = /^(?:javascript|vbscript|file|filesystem):/i;
    var SAFE_DATA_URL = /^data:(?:image\/(?:png|jpeg|jpg|webp|gif)|application\/(?:pdf|json|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)|text\/(?:plain|csv))(?:;charset=[a-z0-9._-]+)?;base64,[a-z0-9+/=\s]+$/i;
    var SPREADSHEET_FORMULA = /^[\u0000-\u0020]*[=+\-@]/;
    var RESTRICTED_EXTENSIONS = new Set([
        'app', 'apk', 'bat', 'bin', 'cmd', 'com', 'cpl', 'dll', 'dmg', 'exe', 'hta',
        'html', 'htm', 'jar', 'js', 'jse', 'lnk', 'mjs', 'msi', 'php', 'ps1', 'scr',
        'sh', 'svg', 'vbs', 'vbe', 'wsf', 'xhtml', 'xlsm', 'docm'
    ]);
    var FILE_PROFILES = Object.freeze({
        image: {
            extensions: ['jpg', 'jpeg', 'png', 'webp'],
            mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
            maxBytes: 2 * 1024 * 1024
        },
        leaveDocument: {
            extensions: ['pdf', 'jpg', 'jpeg', 'png'],
            mimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
            maxBytes: 5 * 1024 * 1024
        },
        document: {
            extensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx'],
            mimeTypes: [
                'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            ],
            maxBytes: 10 * 1024 * 1024
        },
        spreadsheet: {
            extensions: ['csv', 'tsv', 'xls', 'xlsx'],
            mimeTypes: [
                'text/csv', 'text/tab-separated-values', 'text/plain',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            ],
            maxBytes: 20 * 1024 * 1024
        }
    });

    var parserPolicy = null;
    var defaultPolicy = null;
    var guardsInstalled = false;

    function safeString(value, fallback) {
        if (value === null || typeof value === 'undefined') return fallback || '';
        try { return String(value); } catch (error) { return fallback || ''; }
    }

    function sanitizeText(value, maxLength) {
        var limit = Number(maxLength) > 0 ? Number(maxLength) : MAX_TEXT_LENGTH;
        return safeString(value, '')
            .replace(/\u0000/g, '')
            .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
            .slice(0, limit);
    }

    function escapeHTML(value) {
        return sanitizeText(value).replace(/[&<>"']/g, function escape(character) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
        });
    }

    function sanitizeFilename(value, fallback) {
        var filename = sanitizeText(value, 220).replace(/^[a-z]:/i, '').replace(/\\/g, '/').split('/').pop();
        filename = filename.replace(/[<>:"|?*\u0000-\u001f\u007f]/g, '-').replace(/\.{2,}/g, '.').trim();
        filename = filename.replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 180);
        return filename || sanitizeText(fallback || 'download', 80).replace(/[^a-z0-9._-]/gi, '-') || 'download';
    }

    function isSafeDataUrl(value) {
        return SAFE_DATA_URL.test(sanitizeText(value, 25 * 1024 * 1024));
    }

    function decodeUrlEntities(value) {
        return value
            .replace(/&#x([0-9a-f]+);?/gi, function hexEntity(match, code) { return String.fromCharCode(parseInt(code, 16)); })
            .replace(/&#([0-9]+);?/g, function decimalEntity(match, code) { return String.fromCharCode(parseInt(code, 10)); })
            .replace(/&(colon|tab|newline|amp);?/gi, function namedEntity(match, name) {
                return { colon: ':', tab: '\t', newline: '\n', amp: '&' }[name.toLowerCase()];
            });
    }

    function sanitizeURL(value, options) {
        var settings = options || {};
        var raw = decodeUrlEntities(sanitizeText(value, settings.maxLength || 25 * 1024 * 1024)).trim();
        if (!raw || /[\u0000-\u001f\u007f]/.test(raw) || SCRIPTABLE_SCHEME.test(raw)) return '';
        if (/^data:/i.test(raw)) return settings.allowData && isSafeDataUrl(raw) ? raw : '';
        if (/^blob:/i.test(raw)) return settings.allowBlob ? raw : '';
        if (/^(?:#|\?|\.\.?\/|\/[^/])/.test(raw) || /^[a-z0-9_.~-]+(?:\/[a-z0-9_./~-]*)?(?:[?#].*)?$/i.test(raw)) return raw;
        try {
            var base = global.location && global.location.origin ? global.location.origin : 'https://arthhrms.invalid';
            var parsed = new URL(raw, base);
            if (parsed.username || parsed.password) return '';
            if (parsed.protocol === 'https:' || (settings.allowHttp && parsed.protocol === 'http:')) return parsed.href;
            if (settings.allowContact && (parsed.protocol === 'mailto:' || parsed.protocol === 'tel:')) return raw;
        } catch (error) {}
        return '';
    }

    function sanitizeScriptURL(value) {
        var raw = sanitizeText(value, 2048).trim();
        if (/^(?:\.\.?\/|\/[^/]|[a-z0-9_.~-]+\/)/i.test(raw)) return raw;
        try {
            var parsed = new URL(raw, global.location && global.location.origin || 'https://arthhrms.invalid');
            if (parsed.protocol !== 'https:') return '';
            if (['cdn.jsdelivr.net', 'cdnjs.cloudflare.com'].indexOf(parsed.hostname) !== -1) return parsed.href;
            if (global.location && parsed.origin === global.location.origin) return parsed.href;
        } catch (error) {}
        return '';
    }

    function sanitizeStyle(value) {
        var style = sanitizeText(value, 12000);
        if (/(?:url\s*\(|expression\s*\(|@import|javascript\s*:|vbscript\s*:|behavior\s*:|-moz-binding|\\00)/i.test(style)) return '';
        return style.split(';').map(function declaration(part) {
            var separator = part.indexOf(':');
            if (separator <= 0) return '';
            var property = part.slice(0, separator).trim().toLowerCase();
            var propertyValue = part.slice(separator + 1).trim();
            if (!/^(?:--[a-z0-9_-]+|[a-z-]+)$/i.test(property)) return '';
            if (!propertyValue || /[<>`]/.test(propertyValue)) return '';
            return property + ':' + propertyValue;
        }).filter(Boolean).join(';');
    }

    function sanitizeEventHandler(value) {
        var handler = sanitizeText(value, 600).trim();
        if (!handler || BLOCKED_HANDLER_TOKENS.test(handler) || /[<>{}`]/.test(handler)) return '';
        if ((handler.match(/;/g) || []).length > 1 || (/;/.test(handler) && !/;\s*$/.test(handler))) return '';
        if (!/^(?:return\s+)?[a-z_$][\w$]*(?:\.[a-z_$][\w$]*)?\s*\([\s\S]*\)\s*;?$/i.test(handler)) return '';
        return handler;
    }

    function sanitizeAttribute(element, attribute) {
        var name = safeString(attribute && attribute.name, '').toLowerCase();
        var value = safeString(attribute && attribute.value, '');
        if (!name || name === 'srcdoc' || name === 'nonce' || name === 'integrity' || name === 'autofocus') {
            element.removeAttribute(attribute.name);
            return;
        }
        if (name.indexOf('on') === 0) {
            var safeHandler = ALLOWED_EVENT_ATTRIBUTES.has(name) ? sanitizeEventHandler(value) : '';
            if (!safeHandler) element.removeAttribute(attribute.name);
            return;
        }
        if (name === 'style') {
            var safeStyle = sanitizeStyle(value);
            if (safeStyle) element.setAttribute(attribute.name, safeStyle);
            else element.removeAttribute(attribute.name);
            return;
        }
        if (URL_ATTRIBUTES.has(name)) {
            var tag = safeString(element.localName || element.tagName, '').toLowerCase();
            var safeUrl = sanitizeURL(value, {
                allowBlob: tag === 'a' || tag === 'img',
                allowData: tag === 'img' || (tag === 'a' && element.hasAttribute('download')),
                allowContact: tag === 'a'
            });
            if (safeUrl) element.setAttribute(attribute.name, safeUrl);
            else element.removeAttribute(attribute.name);
        }
    }

    function sanitizeDocument(documentValue) {
        if (!documentValue || !documentValue.querySelectorAll) return '';
        Array.from(documentValue.querySelectorAll('*')).forEach(function cleanElement(element) {
            var tag = safeString(element.localName || element.tagName, '').toLowerCase();
            if (BLOCKED_ELEMENTS.has(tag)) {
                element.remove();
                return;
            }
            Array.from(element.attributes || []).forEach(function cleanAttribute(attribute) {
                sanitizeAttribute(element, attribute);
            });
            if (tag === 'a' && element.getAttribute('target') === '_blank') {
                element.setAttribute('rel', 'noopener noreferrer');
            }
            if (tag === 'form') {
                var action = element.getAttribute('action');
                if (action && !sanitizeURL(action)) element.removeAttribute('action');
            }
        });
        var body = documentValue.body || documentValue.documentElement;
        return body ? body.innerHTML : '';
    }

    function regexSanitize(markup) {
        var result = sanitizeText(markup);
        result = result.replace(/<(script|iframe|object|embed|style|template|math|foreignobject)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
        result = result.replace(/<(script|iframe|object|embed|base|meta|link|style|template|applet|frame|frameset)\b[^>]*\/?\s*>/gi, '');
        result = result.replace(/\s(srcdoc|nonce|autofocus)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
        result = result.replace(/\s(on[a-z]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi, function eventAttribute(match, name, quoted, doubleValue, singleValue, bareValue) {
            var value = doubleValue || singleValue || bareValue || '';
            var safe = ALLOWED_EVENT_ATTRIBUTES.has(name.toLowerCase()) ? sanitizeEventHandler(value) : '';
            return safe ? ' ' + name.toLowerCase() + '="' + escapeHTML(safe) + '"' : '';
        });
        result = result.replace(/\sstyle\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi, function styleAttribute(match, quoted, doubleValue, singleValue, bareValue) {
            var safe = sanitizeStyle(doubleValue || singleValue || bareValue || '');
            return safe ? ' style="' + escapeHTML(safe) + '"' : '';
        });
        result = result.replace(/\s(href|src|action|formaction|poster|background|xlink:href)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi, function urlAttribute(match, name, quoted, doubleValue, singleValue, bareValue) {
            var value = doubleValue || singleValue || bareValue || '';
            var safe = sanitizeURL(value, { allowBlob: true, allowData: name.toLowerCase() === 'src' || /\bdownload\b/i.test(match), allowContact: true });
            return safe ? ' ' + name.toLowerCase() + '="' + escapeHTML(safe) + '"' : '';
        });
        return result;
    }

    function sanitizeMarkup(markup) {
        var source = sanitizeText(markup);
        if (!global.DOMParser) return regexSanitize(source);
        try {
            var parserInput = parserPolicy ? parserPolicy.createHTML(source) : source;
            var documentValue = new global.DOMParser().parseFromString(parserInput, 'text/html');
            return sanitizeDocument(documentValue);
        } catch (error) {
            return regexSanitize(source);
        }
    }

    function setText(element, value) {
        if (!element) return null;
        element.textContent = sanitizeText(value);
        return element;
    }

    function setSafeHTML(element, markup) {
        if (!element) return null;
        if (defaultPolicy) element.innerHTML = defaultPolicy.createHTML(markup);
        else element.innerHTML = sanitizeMarkup(markup);
        return element;
    }

    function setSafeAttribute(element, name, value) {
        if (!element || !name) return false;
        var attributeName = sanitizeText(name, 80).toLowerCase();
        if (attributeName.indexOf('on') === 0 || attributeName === 'srcdoc') return false;
        if (URL_ATTRIBUTES.has(attributeName)) {
            var safeUrl = sanitizeURL(value, { allowBlob: true, allowData: element.localName === 'img', allowContact: element.localName === 'a' });
            if (!safeUrl) return false;
            element.setAttribute(attributeName, safeUrl);
            return true;
        }
        element.setAttribute(attributeName, sanitizeText(value, 12000));
        return true;
    }

    function fileExtension(filename) {
        var safeName = sanitizeFilename(filename, 'upload');
        var index = safeName.lastIndexOf('.');
        return index > -1 ? safeName.slice(index + 1).toLowerCase() : '';
    }

    function validateFileDescriptor(file, profileName, options) {
        var profile = FILE_PROFILES[profileName] || FILE_PROFILES.document;
        var settings = options || {};
        var name = sanitizeFilename(file && file.name, 'upload');
        var extension = fileExtension(name);
        var mimeType = sanitizeText(file && file.type, 180).toLowerCase().split(';')[0].trim();
        var size = Number(file && file.size);
        var parts = name.toLowerCase().split('.').slice(0, -1);
        var errors = [];
        if (!file || typeof file !== 'object') errors.push('A file is required.');
        if (!extension || profile.extensions.indexOf(extension) === -1 || RESTRICTED_EXTENSIONS.has(extension)) errors.push('File type is not allowed.');
        if (parts.some(function restricted(part) { return RESTRICTED_EXTENSIONS.has(part); })) errors.push('Multiple or disguised file extensions are not allowed.');
        if (!Number.isFinite(size) || size <= 0) errors.push('File is empty or its size is invalid.');
        if (size > Number(settings.maxBytes || profile.maxBytes)) errors.push('File exceeds the allowed size.');
        if (mimeType && profile.mimeTypes.indexOf(mimeType) === -1) errors.push('File MIME type does not match the allowed profile.');
        return {
            valid: errors.length === 0,
            errors: errors,
            fileName: name,
            extension: extension,
            mimeType: mimeType,
            size: Number.isFinite(size) ? size : 0,
            profile: profileName || 'document'
        };
    }

    function bytesStartWith(bytes, signature) {
        return signature.every(function compare(value, index) { return bytes[index] === value; });
    }

    function signatureMatches(bytes, descriptor) {
        var extension = descriptor.extension;
        if (extension === 'pdf') return bytesStartWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
        if (extension === 'png') return bytesStartWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        if (extension === 'jpg' || extension === 'jpeg') return bytesStartWith(bytes, [0xff, 0xd8, 0xff]);
        if (extension === 'webp') return bytesStartWith(bytes, [0x52, 0x49, 0x46, 0x46]) && bytesStartWith(bytes.slice(8), [0x57, 0x45, 0x42, 0x50]);
        if (extension === 'xlsx' || extension === 'docx') return bytesStartWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
        if (extension === 'xls' || extension === 'doc') return bytesStartWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
        if (extension === 'csv' || extension === 'tsv') {
            if (bytes.some(function nul(value) { return value === 0; })) return false;
            var prefix = String.fromCharCode.apply(null, Array.from(bytes.slice(0, 64))).trim().toLowerCase();
            return !/^(?:<\!doctype\s+html|<html|<script|<svg|mz)/.test(prefix);
        }
        return false;
    }

    async function validateFile(file, profileName, options) {
        var descriptor = validateFileDescriptor(file, profileName, options);
        if (!descriptor.valid || !file || typeof file.slice !== 'function') return descriptor;
        try {
            var buffer = await file.slice(0, 512).arrayBuffer();
            var bytes = new Uint8Array(buffer);
            if (!signatureMatches(bytes, descriptor)) descriptor.errors.push('File content does not match its extension.');
        } catch (error) {
            descriptor.errors.push('File content could not be inspected safely.');
        }
        descriptor.valid = descriptor.errors.length === 0;
        return descriptor;
    }

    async function readFileAsDataURL(file, profileName, options) {
        var validation = await validateFile(file, profileName, options);
        if (!validation.valid) return { success: false, validation: validation, dataUrl: '' };
        return new Promise(function read(resolve) {
            var reader = new FileReader();
            reader.onload = function loaded(event) {
                var dataUrl = sanitizeURL(event && event.target && event.target.result, { allowData: true });
                resolve({ success: !!dataUrl, validation: validation, dataUrl: dataUrl, error: dataUrl ? '' : 'Unsafe file data URL was blocked.' });
            };
            reader.onerror = function failed() {
                resolve({ success: false, validation: validation, dataUrl: '', error: 'File could not be read.' });
            };
            reader.readAsDataURL(file);
        });
    }

    function escapeCSVCell(value) {
        var text = sanitizeText(value).replace(/\r?\n/g, ' ');
        if (SPREADSHEET_FORMULA.test(text)) text = "'" + text;
        return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    }

    function downloadDataUrl(dataUrl, filename) {
        if (!global.document) return false;
        var safeUrl = sanitizeURL(dataUrl, { allowData: true, allowBlob: true });
        if (!safeUrl) return false;
        var anchor = global.document.createElement('a');
        anchor.href = safeUrl;
        anchor.download = sanitizeFilename(filename, 'download');
        anchor.rel = 'noopener';
        anchor.click();
        return true;
    }

    function downloadBlob(content, filename, mimeType) {
        if (!global.document || !global.URL || !global.Blob) return false;
        var blob = content instanceof Blob ? content : new Blob([content], { type: sanitizeText(mimeType || 'application/octet-stream', 180) });
        var url = global.URL.createObjectURL(blob);
        var success = downloadDataUrl(url, filename);
        global.setTimeout(function revoke() { global.URL.revokeObjectURL(url); }, 0);
        return success;
    }

    function printDocument(markup, title) {
        if (!global.open || !global.document) return false;
        var popup = global.open('', '_blank', 'noopener');
        if (!popup || !popup.document) return false;
        var documentValue = popup.document;
        var head = documentValue.head || documentValue.createElement('head');
        var body = documentValue.body || documentValue.createElement('body');
        documentValue.title = sanitizeText(title || 'Report', 160);
        var meta = documentValue.createElement('meta');
        meta.setAttribute('http-equiv', 'Content-Security-Policy');
        meta.setAttribute('content', "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src 'none'; base-uri 'none'; form-action 'none'");
        head.appendChild(meta);
        var style = documentValue.createElement('style');
        style.textContent = 'body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;font-size:12px}th{background:#0a74da;color:#fff}';
        head.appendChild(style);
        var container = documentValue.createElement('main');
        container.innerHTML = sanitizeMarkup(markup);
        body.replaceChildren(container);
        if (!documentValue.head) documentValue.documentElement.appendChild(head);
        if (!documentValue.body) documentValue.documentElement.appendChild(body);
        popup.focus();
        popup.print();
        return true;
    }

    function installFallbackDomGuards() {
        if (!global.Element || !global.Document) return;
        var innerDescriptor = Object.getOwnPropertyDescriptor(global.Element.prototype, 'innerHTML');
        var outerDescriptor = Object.getOwnPropertyDescriptor(global.Element.prototype, 'outerHTML');
        if (innerDescriptor && innerDescriptor.set && innerDescriptor.get) {
            Object.defineProperty(global.Element.prototype, 'innerHTML', {
                configurable: innerDescriptor.configurable,
                enumerable: innerDescriptor.enumerable,
                get: innerDescriptor.get,
                set: function guardedInnerHTML(value) { innerDescriptor.set.call(this, sanitizeMarkup(value)); }
            });
        }
        if (outerDescriptor && outerDescriptor.set && outerDescriptor.get) {
            Object.defineProperty(global.Element.prototype, 'outerHTML', {
                configurable: outerDescriptor.configurable,
                enumerable: outerDescriptor.enumerable,
                get: outerDescriptor.get,
                set: function guardedOuterHTML(value) { outerDescriptor.set.call(this, sanitizeMarkup(value)); }
            });
        }
        var originalInsertAdjacentHTML = global.Element.prototype.insertAdjacentHTML;
        if (originalInsertAdjacentHTML) {
            global.Element.prototype.insertAdjacentHTML = function guardedInsert(position, markup) {
                return originalInsertAdjacentHTML.call(this, position, sanitizeMarkup(markup));
            };
        }
        global.Document.prototype.write = function blockedDocumentWrite() { throw new Error('document.write is blocked by FrontendSecurityService.'); };
        global.Document.prototype.writeln = function blockedDocumentWriteln() { throw new Error('document.writeln is blocked by FrontendSecurityService.'); };
    }

    function installDomGuards() {
        if (guardsInstalled || !global.document) return;
        guardsInstalled = true;
        if (global.trustedTypes && typeof global.trustedTypes.createPolicy === 'function') {
            try {
                parserPolicy = global.trustedTypes.createPolicy('arthhrms-sanitizer', {
                    createHTML: function parserHTML(value) { return safeString(value, ''); }
                });
                defaultPolicy = global.trustedTypes.createPolicy('default', {
                    createHTML: sanitizeMarkup,
                    createScriptURL: function trustedScriptURL(value) { return sanitizeScriptURL(value) || 'about:blank'; }
                });
                return;
            } catch (error) {
                parserPolicy = null;
                defaultPolicy = null;
            }
        }
        installFallbackDomGuards();
    }

    var service = Object.freeze({
        VERSION: VERSION,
        FILE_PROFILES: FILE_PROFILES,
        sanitizeText: sanitizeText,
        escapeHTML: escapeHTML,
        sanitizeMarkup: sanitizeMarkup,
        sanitizeURL: sanitizeURL,
        sanitizeStyle: sanitizeStyle,
        sanitizeFilename: sanitizeFilename,
        setText: setText,
        setSafeHTML: setSafeHTML,
        setSafeAttribute: setSafeAttribute,
        validateFileDescriptor: validateFileDescriptor,
        validateFile: validateFile,
        readFileAsDataURL: readFileAsDataURL,
        escapeCSVCell: escapeCSVCell,
        downloadDataUrl: downloadDataUrl,
        downloadBlob: downloadBlob,
        printDocument: printDocument,
        installDomGuards: installDomGuards
    });

    global.FrontendSecurityService = service;
    global.frontendSecurityService = service;
    installDomGuards();
})(typeof window !== 'undefined' ? window : globalThis);
