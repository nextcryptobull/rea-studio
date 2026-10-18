// Demo data generator that produces realistic-looking findings for each target
// type. In production this would be replaced by parsing the actual JSON / SSE
// stream emitted by the `rea-agents` CLI. For the sandbox preview we generate
// plausible findings so the dashboard is fully explorable end-to-end.

import type {
  FindingCategory,
  Severity,
  Evidence,
  TargetType,
} from './types'

type FindingTemplate = {
  category: FindingCategory
  severity: Severity
  title: string
  description: string
  evidence: Evidence[]
}

// ---- Website findings ------------------------------------------------------

const WEBSITE_TEMPLATES: FindingTemplate[] = [
  {
    category: 'network',
    severity: 'high',
    title: 'Sensitive resource loaded over plaintext HTTP',
    description:
      'A login form on the page POSTs credentials to an http:// endpoint instead of https://. A network attacker on the same path can intercept the credentials. The form action is reachable from the homepage in one click.',
    evidence: [
      {
        kind: 'code',
        snippet: '<form action="http://api.example.com/login" method="POST">',
        location: 'index.html:42',
      },
      {
        kind: 'header',
        snippet: 'Strict-Transport-Security: absent',
        location: 'response headers',
      },
    ],
  },
  {
    category: 'api',
    severity: 'medium',
    title: 'Undocumented /v2/internal endpoint discovered',
    description:
      'A fetch() call inside main.js contacts /v2/internal/telemetry which is not referenced by any UI element. The endpoint returns 200 with a JSON body listing user fields including email and ip — exposing PII to any caller with the URL.',
    evidence: [
      {
        kind: 'url',
        snippet: 'https://example.com/v2/internal/telemetry',
        location: 'main.js (minified, line 1240)',
      },
      {
        kind: 'code',
        snippet: 'fetch("/v2/internal/telemetry", { credentials: "include" })',
        location: 'main.js:1240',
      },
    ],
  },
  {
    category: 'crypto',
    severity: 'critical',
    title: 'Client-side "encryption" with hardcoded AES key',
    description:
      'The site ships an AES-CBC implementation in the bundle with the key embedded as a constant. Any "encrypted" payload sent to the server can be trivially decrypted and forged by anyone who reads the bundle. This is a false sense of security — the design must move to server-side encryption with per-session keys.',
    evidence: [
      {
        kind: 'code',
        snippet: 'const KEY = "0123456789abcdef0123456789abcdef";',
        location: 'crypto.js:18',
      },
      {
        kind: 'code',
        snippet: 'function encrypt(p){return aesEncrypt(p, KEY, IV)}',
        location: 'crypto.js:42',
      },
    ],
  },
  {
    category: 'behavior',
    severity: 'medium',
    title: 'Service worker exfiltrates URL hash to third-party domain',
    description:
      'The registered service worker intercepts navigation requests and posts the URL hash (often containing access tokens or invite codes) to analytics.thirdparty.io. Hashes are normally exempt from CSP restrictions, making this hard to detect from the page.',
    evidence: [
      {
        kind: 'code',
        snippet: "clients.matchAll().forEach(c => c.postMessage({hash: location.hash}))",
        location: 'sw.js:88',
      },
      {
        kind: 'url',
        snippet: 'https://analytics.thirdparty.io/collect',
        location: 'sw.js:91',
      },
    ],
  },
  {
    category: 'string',
    severity: 'low',
    title: 'Build-time source map exposed in production',
    description:
      'main.js.map is reachable at /main.js.map and contains the original unminified source. While not directly exploitable, it drastically lowers the bar for attackers to understand the application and locate further vulnerabilities.',
    evidence: [
      {
        kind: 'url',
        snippet: 'https://example.com/main.js.map',
        location: 'response 200, 1.4MB',
      },
    ],
  },
]

// ---- Android APK findings --------------------------------------------------

const APK_TEMPLATES: FindingTemplate[] = [
  {
    category: 'permission',
    severity: 'high',
    title: 'android.permission.READ_SMS declared but unused by app code',
    description:
      'The manifest requests READ_SMS, but no Smali class references Telephony.SMS or SmsManager. The permission is almost certainly leftover from a copy-pasted template. Remove it before publishing — Google Play flags SMS-reading apps and may suspend the listing.',
    evidence: [
      {
        kind: 'permission',
        snippet: '<uses-permission android:name="android.permission.READ_SMS" />',
        location: 'AndroidManifest.xml:14',
      },
      {
        kind: 'symbol',
        snippet: 'no references to Landroid/telephony/SmsManager;*',
        location: 'static analysis, all .smali files',
      },
    ],
  },
  {
    category: 'network',
    severity: 'critical',
    title: 'Cleartext HTTP traffic permitted globally',
    description:
      'android:usesCleartextTraffic="true" is set on the <application> tag with no per-domain network security config. Any HTTP request the app makes is sent unencrypted and can be intercepted on the wire. Add a network_security_config.xml that denies cleartext for all production domains.',
    evidence: [
      {
        kind: 'code',
        snippet: '<application android:usesCleartextTraffic="true" ...>',
        location: 'AndroidManifest.xml:23',
      },
      {
        kind: 'url',
        snippet: 'http://api.example.com/v1/sync',
        location: 'SyncService.smali:114',
      },
    ],
  },
  {
    category: 'crypto',
    severity: 'high',
    title: 'Hardcoded Firebase / Google API key in resources',
    description:
      'A Google API key beginning AIzaSy... is hardcoded in res/values/strings.xml. Anyone who extracts the APK can use it to call Google APIs as this app, potentially racking up quota charges. The key is also not restricted by package name + SHA-1 fingerprint in the Google Cloud console.',
    evidence: [
      {
        kind: 'string',
        snippet: 'AIzaSyA1B2C3D4E5F6G7H8I9J0KLMNOPQRSTUvW',
        location: 'res/values/strings.xml:7',
      },
    ],
  },
  {
    category: 'behavior',
    severity: 'medium',
    title: 'WebView with JavaScript + addJavascriptInterface over http://',
    description:
      'The in-app WebView loads an http:// URL and exposes a Java object to JavaScript via addJavascriptInterface(). On Android < 4.2 this is a well-known RCE vector; on all versions, allowing JS to call into Java over an untrusted network origin is dangerous. Restrict to https and pin the host.',
    evidence: [
      {
        kind: 'code',
        snippet: 'webView.getSettings().setJavaScriptEnabled(true);',
        location: 'com/example/web/BannerActivity.smali:78',
      },
      {
        kind: 'code',
        snippet: 'webView.addJavascriptInterface(new Bridge(), "NativeBridge");',
        location: 'com/example/web/BannerActivity.smali:81',
      },
    ],
  },
  {
    category: 'api',
    severity: 'low',
    title: 'Debug logging leaves verbose PII trace in logcat',
    description:
      'Multiple classes call Log.d("LoginFlow", email) etc. On a rooted device or via adb, anyone can read PII straight from logcat during normal use. Wrap logging behind a BuildConfig.DEBUG flag in release builds.',
    evidence: [
      {
        kind: 'code',
        snippet: 'Log.d("LoginFlow", "user=" + email + " token=" + token)',
        location: 'com/example/auth/LoginActivity.smali:142',
      },
    ],
  },
]

// ---- Desktop binary findings -----------------------------------------------

const BINARY_TEMPLATES: FindingTemplate[] = [
  {
    category: 'crypto',
    severity: 'critical',
    title: 'Single-round SHA1 used as password hash',
    description:
      'The binary hashes user passwords with a single round of SHA-1 and compares the digest to a stored value. SHA-1 is collision-broken and far too fast for password verification — modern GPUs can try billions of SHA-1 candidates per second. Replace with argon2id or bcrypt with a sufficient work factor.',
    evidence: [
      {
        kind: 'symbol',
        snippet: 'call SHA1_Update @ 0x4012A0',
        location: '.text:0x40129A',
      },
      {
        kind: 'code',
        snippet: 'if (memcmp(hash, stored, 20) == 0) grant_access();',
        location: 'decompiled, verifyPassword @ 0x4012C0',
      },
    ],
  },
  {
    category: 'behavior',
    severity: 'high',
    title: 'strcpy into stack buffer without bounds check',
    description:
      'A user-controlled argument is copied into a 64-byte stack buffer via strcpy() with no length check. A classic stack buffer overflow that is almost certainly exploitable for arbitrary code execution. Replace strcpy with strlcpy or strncpy with explicit length validation upstream.',
    evidence: [
      {
        kind: 'symbol',
        snippet: 'call strcpy @ 0x402B40',
        location: '.text:0x402B38',
      },
      {
        kind: 'code',
        snippet: 'char buf[64]; strcpy(buf, argv[1]);',
        location: 'decompiled, parseArgs @ 0x402B00',
      },
    ],
  },
  {
    category: 'network',
    severity: 'medium',
    title: 'TLS certificate validation disabled',
    description:
      'The binary calls SSL_CTX_set_verify(ctx, SSL_VERIFY_NONE, NULL) when establishing outbound TLS connections, effectively accepting any certificate including self-signed ones presented by an active MITM. Set SSL_VERIFY_PEER and provide a proper verification callback.',
    evidence: [
      {
        kind: 'symbol',
        snippet: 'call SSL_CTX_set_verify @ 0x403120',
        location: '.text:0x403118',
      },
      {
        kind: 'code',
        snippet: 'SSL_CTX_set_verify(ctx, SSL_VERIFY_NONE, NULL);',
        location: 'decompiled, tlsInit @ 0x403100',
      },
    ],
  },
  {
    category: 'string',
    severity: 'info',
    title: 'Hardcoded development URL still present in release build',
    description:
      'A hardcoded http://localhost:8080/api URL is present in the .rodata section, suggesting the dev environment configuration was not stripped before release. Not directly exploitable but signals a release-process gap that may also leak other dev secrets.',
    evidence: [
      {
        kind: 'string',
        snippet: 'http://localhost:8080/api/v2/sync',
        location: '.rodata:0x4A0120',
      },
    ],
  },
  {
    category: 'permission',
    severity: 'low',
    title: 'Binary marked setuid root without capability drop',
    description:
      'The ELF file is installed setuid root and never calls setuid()/setgid() to drop privileges after startup. Any vulnerability in the binary leads immediately to full root compromise. Drop privileges after the privileged setup phase completes.',
    evidence: [
      {
        kind: 'file',
        snippet: 'setuid bit set on /usr/local/bin/example-daemon',
        location: 'filesystem metadata',
      },
      {
        kind: 'symbol',
        snippet: 'no calls to setuid or setgid in .text',
        location: 'static analysis',
      },
    ],
  },
]

const TEMPLATES_BY_TYPE: Record<TargetType, FindingTemplate[]> = {
  website: WEBSITE_TEMPLATES,
  apk: APK_TEMPLATES,
  binary: BINARY_TEMPLATES,
}

// Engine label for each target type — what REA would actually invoke.
const ENGINE_BY_TYPE: Record<TargetType, string> = {
  website: 'static + headless',
  apk: 'jadx',
  binary: 'ghidra',
}

// Progress log lines that the worker streams as it "analyzes". Realistic cadence
// makes the UI feel alive during the demo.
const LOG_LINES_BY_TYPE: Record<TargetType, string[]> = {
  website: [
    'rea: resolving target URL',
    'rea: fetching root document',
    'rea: extracting inline and external scripts',
    'rea: de-minifying main.js',
    'rea: enumerating fetch() / XHR call sites',
    'rea: tainting input sources (location.hash, postMessage, URL params)',
    'rea: scanning for client-side crypto with constant keys',
    'rea: checking CSP and HSTS headers',
    'rea: inspecting registered service workers',
    'rea: cross-referencing discovered endpoints',
    'rea: producing findings',
  ],
  apk: [
    'rea: opening APK zip container',
    'rea: extracting AndroidManifest.xml',
    'rea: decoding resources via aapt',
    'rea: running jadx on classes.dex',
    'rea: indexing Smali references',
    'rea: tainting IPC entry points (Intent, AIDL)',
    'rea: scanning declared permissions vs. referenced APIs',
    'rea: inspecting network security config',
    'rea: enumerating hardcoded strings',
    'rea: checking WebView configurations',
    'rea: producing findings',
  ],
  binary: [
    'rea: loading ELF into Ghidra',
    'rea: running auto-analysis (this can take a moment)',
    'rea: applying known symbol signatures',
    'rea: decompiling .text functions',
    'rea: tainting argv / getenv / read() input',
    'rea: scanning for unsafe libc calls',
    'rea: enumerating crypto routines',
    'rea: inspecting TLS context setup',
    'rea: walking .rodata for hardcoded URLs and keys',
    'rea: producing findings',
  ],
}

export function getEngine(targetType: TargetType): string {
  return ENGINE_BY_TYPE[targetType]
}

export function getLogLines(targetType: TargetType): string[] {
  return LOG_LINES_BY_TYPE[targetType]
}

export function getFindingTemplates(targetType: TargetType): FindingTemplate[] {
  return TEMPLATES_BY_TYPE[targetType]
}
