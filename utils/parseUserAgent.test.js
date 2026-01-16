/**
 * Unit tests for parseUserAgent utility
 * Data-driven test structure with UA strings and COMPLETE expected outputs
 */

const parseUserAgent = require('../server/utils/parseUserAgent');

// =============================================================================
// TEST DATA - Organized by category with UA strings and COMPLETE expected outputs
// =============================================================================

const TEST_CASES = {
    'Modern Browsers': {
        'Chrome on Windows': {
            ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            output: {
                browser: { name: 'Chrome', version: '120.0.0.0', major: '120' },
                engine: { name: 'Blink', version: '120.0.0.0' },
                os: { name: 'Windows', version: '10' },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: 'amd64' },
                isBot: false
            }
        },
        'Firefox on macOS': {
            ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
            output: {
                browser: { name: 'Firefox', version: '121.0', major: '121' },
                engine: { name: 'Gecko', version: '20100101' },
                os: { name: 'macOS', version: '10.15' },
                device: { type: null, vendor: 'Apple', model: null },
                cpu: { architecture: null },
                isBot: false
            }
        },
        'Safari on macOS': {
            ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
            output: {
                browser: { name: 'Safari', version: '17.2', major: '17' },
                engine: { name: 'WebKit', version: '605.1.15' },
                os: { name: 'macOS', version: '10.15.7' },
                device: { type: null, vendor: 'Apple', model: null },
                cpu: { architecture: null },
                isBot: false
            }
        }
    },

    'Chromium-based Browsers': {
        'Edge on Windows': {
            ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91',
            output: {
                browser: { name: 'Edge', version: '120.0.2210.91', major: '120' },
                engine: { name: 'Blink', version: '120.0.0.0' },
                os: { name: 'Windows', version: '10' },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: 'amd64' },
                isBot: false
            }
        },
        'Opera': {
            ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 OPR/105.0.0.0',
            output: {
                browser: { name: 'Opera', version: '105.0.0.0', major: '105' },
                engine: { name: 'Blink', version: '119.0.0.0' },
                os: { name: 'Windows', version: '10' },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: 'amd64' },
                isBot: false
            }
        },
        'Brave': {
            ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Brave/120',
            output: {
                browser: { name: 'Brave', version: '120', major: '120' },
                engine: { name: 'Blink', version: '120.0.0.0' },
                os: { name: 'Windows', version: '10' },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: 'amd64' },
                isBot: false
            }
        },
        'Vivaldi': {
            ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Vivaldi/6.4.3160.47',
            output: {
                browser: { name: 'Vivaldi', version: '6.4.3160.47', major: '6' },
                engine: { name: 'Blink', version: '120.0.0.0' },
                os: { name: 'Windows', version: '10' },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: 'amd64' },
                isBot: false
            }
        },
        'Samsung Internet': {
            ua: 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
            output: {
                browser: { name: 'Samsung Internet', version: '23.0', major: '23' },
                engine: { name: 'Blink', version: '115.0.0.0' },
                os: { name: 'Android', version: '13' },
                device: { type: 'mobile', vendor: 'Samsung', model: 'SM-G991B' },
                cpu: { architecture: null },
                isBot: false
            }
        }
    },

    'Mobile Browsers': {
        'Chrome on Android': {
            ua: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36',
            output: {
                browser: { name: 'Chrome', version: '120.0.6099.43', major: '120' },
                engine: { name: 'Blink', version: '120.0.6099.43' },
                os: { name: 'Android', version: '13' },
                device: { type: 'mobile', vendor: 'Google', model: 'Pixel 7' },
                cpu: { architecture: null },
                isBot: false
            }
        },
        'Safari on iOS': {
            ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
            output: {
                browser: { name: 'Safari', version: '17.2', major: '17' },
                engine: { name: 'WebKit', version: '605.1.15' },
                os: { name: 'iOS', version: '17.2' },
                device: { type: 'mobile', vendor: 'Apple', model: 'iPhone' },
                cpu: { architecture: null },
                isBot: false
            }
        },
        'Chrome on iOS (CriOS)': {
            ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.101 Mobile/15E148 Safari/604.1',
            output: {
                browser: { name: 'Chrome', version: '120.0.6099.101', major: '120' },
                engine: { name: 'WebKit', version: '605.1.15' },
                os: { name: 'iOS', version: '17.0' },
                device: { type: 'mobile', vendor: 'Apple', model: 'iPhone' },
                cpu: { architecture: null },
                isBot: false
            }
        },
        'iPad': {
            ua: 'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
            output: {
                browser: { name: 'Safari', version: '17.2', major: '17' },
                engine: { name: 'WebKit', version: '605.1.15' },
                os: { name: 'iOS', version: '17.2' },
                device: { type: 'tablet', vendor: 'Apple', model: 'iPad' },
                cpu: { architecture: null },
                isBot: false
            }
        }
    },

    'Legacy Browsers': {
        'Internet Explorer 11': {
            ua: 'Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko',
            output: {
                browser: { name: 'IE', version: '11.0', major: '11' },
                engine: { name: 'Trident', version: '7.0' },
                os: { name: 'Windows', version: '10' },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: 'amd64' },
                isBot: false
            }
        },
        'Internet Explorer 10': {
            ua: 'Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.2; Trident/6.0)',
            output: {
                browser: { name: 'IE', version: '10.0', major: '10' },
                engine: { name: 'Trident', version: '6.0' },
                os: { name: 'Windows', version: '8' },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: null },
                isBot: false
            }
        }
    },

    'AI Bots': {
        'ChatGPT-User': {
            ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot)',
            output: {
                browser: { name: 'ChatGPT-User', version: '1.0', major: '1' },
                engine: { name: 'WebKit', version: '537.36' },
                os: { name: null, version: null },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: null },
                isBot: true
            }
        },
        'GPTBot': {
            ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.3; +https://openai.com/gptbot)',
            output: {
                browser: { name: 'GPTBot', version: '1.3', major: '1' },
                engine: { name: 'WebKit', version: '537.36' },
                os: { name: null, version: null },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: null },
                isBot: true
            }
        },
        'OAI-SearchBot': {
            ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36; compatible; OAI-SearchBot/1.3; +https://openai.com/searchbot',
            output: {
                browser: { name: 'OAI-SearchBot', version: '1.3', major: '1' },
                engine: { name: 'Blink', version: '131.0.0.0' },
                os: { name: 'macOS', version: '10.15.7' },
                device: { type: null, vendor: 'Apple', model: null },
                cpu: { architecture: null },
                isBot: true
            }
        },
        'ClaudeBot': {
            ua: 'ClaudeBot/1.0; +https://www.anthropic.com',
            output: {
                browser: { name: 'ClaudeBot', version: '1.0', major: '1' },
                engine: { name: null, version: null },
                os: { name: null, version: null },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: null },
                isBot: true
            }
        },
        'Claude-User': {
            ua: 'Claude-User/1.0',
            output: {
                browser: { name: 'Claude-User', version: '1.0', major: '1' },
                engine: { name: null, version: null },
                os: { name: null, version: null },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: null },
                isBot: true
            }
        },
        'PerplexityBot': {
            ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
            output: {
                browser: { name: 'PerplexityBot', version: '1.0', major: '1' },
                engine: { name: 'WebKit', version: '537.36' },
                os: { name: null, version: null },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: null },
                isBot: true
            }
        },
        'Perplexity-User': {
            ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)',
            output: {
                browser: { name: 'Perplexity-User', version: '1.0', major: '1' },
                engine: { name: 'WebKit', version: '537.36' },
                os: { name: null, version: null },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: null },
                isBot: true
            }
        },
        'Google-Extended': {
            ua: 'Mozilla/5.0 (compatible; Google-Extended)',
            output: {
                browser: { name: 'Google-Extended', version: null, major: null },
                engine: { name: null, version: null },
                os: { name: null, version: null },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: null },
                isBot: true
            }
        }
    },

    'Traditional Bots': {
        'Googlebot': {
            ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            output: {
                browser: { name: 'Googlebot', version: '2.1', major: '2' },
                engine: { name: null, version: null },
                os: { name: null, version: null },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: null },
                isBot: true
            }
        },
        'Bingbot': {
            ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
            output: {
                browser: { name: 'Bingbot', version: '2.0', major: '2' },
                engine: { name: 'WebKit', version: '537.36' },
                os: { name: null, version: null },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: null },
                isBot: true
            }
        },
        'curl': {
            ua: 'curl/7.88.1',
            output: {
                browser: { name: 'curl', version: '7.88.1', major: '7' },
                engine: { name: null, version: null },
                os: { name: null, version: null },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: null },
                isBot: true
            }
        },
        'wget': {
            ua: 'Wget/1.21.3',
            output: {
                browser: { name: 'wget', version: '1.21.3', major: '1' },
                engine: { name: null, version: null },
                os: { name: null, version: null },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: null },
                isBot: true
            }
        },
        'Yahoo! Slurp': {
            ua: 'Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)',
            output: {
                browser: { name: 'Slurp', version: null, major: null },
                engine: { name: null, version: null },
                os: { name: null, version: null },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: null },
                isBot: true
            }
        },
        'Facebook bot': {
            ua: 'Mozilla/5.0 (compatible; FacebookBot/1.0; +https://developers.facebook.com/docs/sharing/webmasters/facebookbot/)',
            output: {
                browser: { name: null, version: null, major: null },
                engine: { name: null, version: null },
                os: { name: null, version: null },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: null },
                isBot: true
            }
        }
    },

    'Headless Browsers': {
        'HeadlessChrome': {
            ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36',
            output: {
                browser: { name: 'HeadlessChrome', version: '120.0.0.0', major: '120' },
                engine: { name: 'Blink', version: '120.0.0.0' },
                os: { name: 'Linux', version: null },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: 'amd64' },
                isBot: true
            }
        },
        'PhantomJS': {
            ua: 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/534.34 (KHTML, like Gecko) PhantomJS/2.1.1 Safari/534.34',
            output: {
                browser: { name: 'PhantomJS', version: '2.1.1', major: '2' },
                engine: { name: 'WebKit', version: '534.34' },
                os: { name: 'Windows', version: '7' },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: 'amd64' },
                isBot: true
            }
        }
    },

    'WebViews and In-App Browsers': {
        'Facebook in-app': {
            ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21A329 [FBAN/FBIOS;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.0;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]',
            output: {
                browser: { name: 'Facebook', version: null, major: null },
                engine: { name: 'WebKit', version: '605.1.15' },
                os: { name: 'iOS', version: '17.0' },
                device: { type: 'mobile', vendor: 'Apple', model: 'iPhone' },
                cpu: { architecture: null },
                isBot: false
            }
        },
        'Instagram in-app': {
            ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21C62 Instagram 312.0.0.27.111',
            output: {
                browser: { name: 'Instagram', version: '312.0.0.27.111', major: '312' },
                engine: { name: 'WebKit', version: '605.1.15' },
                os: { name: 'iOS', version: '17.2' },
                device: { type: 'mobile', vendor: 'Apple', model: 'iPhone' },
                cpu: { architecture: null },
                isBot: false
            }
        },
        'WhatsApp': {
            ua: 'WhatsApp/2.23.24.18 A',
            output: {
                browser: { name: 'WhatsApp', version: '2.23.24.18', major: '2' },
                engine: { name: null, version: null },
                os: { name: null, version: null },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: null },
                isBot: false
            }
        }
    },

    'Game Consoles': {
        'PlayStation 5': {
            ua: 'Mozilla/5.0 (PlayStation; PlayStation 5/2.26) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0 Safari/605.1.15',
            output: {
                browser: { name: 'Safari', version: '13.0', major: '13' },
                engine: { name: 'WebKit', version: '605.1.15' },
                os: { name: null, version: null },
                device: { type: 'console', vendor: 'Sony', model: null },
                cpu: { architecture: null },
                isBot: false
            }
        },
        'PlayStation 4': {
            ua: 'Mozilla/5.0 (PlayStation 4 3.11) AppleWebKit/537.73 (KHTML, like Gecko)',
            output: {
                browser: { name: null, version: null, major: null },
                engine: { name: 'WebKit', version: '537.73' },
                os: { name: null, version: null },
                device: { type: 'console', vendor: 'Sony', model: null },
                cpu: { architecture: null },
                isBot: false
            }
        },
        'PlayStation Vita': {
            ua: 'Mozilla/5.0 (PlayStation Vita 3.61) AppleWebKit/537.73 (KHTML, like Gecko) Silk/3.2',
            output: {
                browser: { name: null, version: null, major: null },
                engine: { name: 'WebKit', version: '537.73' },
                os: { name: null, version: null },
                device: { type: 'console', vendor: 'Sony', model: null },
                cpu: { architecture: null },
                isBot: false
            }
        },
        'Xbox Series X': {
            ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox Series X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/48.0.2564.82 Safari/537.36 Edge/20.02',
            output: {
                browser: { name: 'Edge', version: '20.02', major: '20' },
                engine: { name: 'Blink', version: '48.0.2564.82' },
                os: { name: 'Windows', version: '10' },
                device: { type: 'console', vendor: 'Microsoft', model: null },
                cpu: { architecture: 'amd64' },
                isBot: false
            }
        },
        'Xbox One': {
            ua: 'Mozilla/5.0 (Windows Phone 10.0; Android 4.2.1; Xbox; Xbox One) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/46.0.2486.0 Mobile Safari/537.36 Edge/13.10586',
            output: {
                browser: { name: 'Edge', version: '13.10586', major: '13' },
                engine: { name: 'Blink', version: '46.0.2486.0' },
                os: { name: 'Android', version: '4.2.1' },
                device: { type: 'console', vendor: 'Microsoft', model: null },
                cpu: { architecture: null },
                isBot: false
            }
        },
        'Nintendo Switch': {
            ua: 'Mozilla/5.0 (Nintendo Switch; WifiWebAuthApplet) AppleWebKit/601.6 (KHTML, like Gecko) NF/4.0.0.5.10 NintendoBrowser/5.1.0.13343',
            output: {
                browser: { name: null, version: null, major: null },
                engine: { name: 'WebKit', version: '601.6' },
                os: { name: null, version: null },
                device: { type: 'console', vendor: 'Nintendo', model: null },
                cpu: { architecture: null },
                isBot: false
            }
        },
        'Nintendo Wii U': {
            ua: 'Mozilla/5.0 (Nintendo WiiU) AppleWebKit/536.30 (KHTML, like Gecko) NX/3.0.4.2.12 NintendoBrowser/4.3.1.11264.US',
            output: {
                browser: { name: null, version: null, major: null },
                engine: { name: 'WebKit', version: '536.30' },
                os: { name: null, version: null },
                device: { type: 'console', vendor: 'Nintendo', model: null },
                cpu: { architecture: null },
                isBot: false
            }
        },
        'Nintendo 3DS': {
            ua: 'Mozilla/5.0 (Nintendo 3DS; U; ; en) Version/1.7412.EU',
            output: {
                browser: { name: null, version: null, major: null },
                engine: { name: null, version: null },
                os: { name: null, version: null },
                device: { type: 'console', vendor: 'Nintendo', model: null },
                cpu: { architecture: null },
                isBot: false
            }
        }
    },

    'Android - Samsung Devices': {
        'Samsung Galaxy S25': {
            ua: 'Mozilla/5.0 (Linux; Android 15; SM-S931B Build/AP3A.240905.015.A2; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36',
            output: {
                browser: { name: 'Chrome', version: '127.0.6533.103', major: '127' },
                engine: { name: 'Blink', version: '127.0.6533.103' },
                os: { name: 'Android', version: '15' },
                device: { type: 'mobile', vendor: 'Samsung', model: 'SM-S931B' },
                cpu: { architecture: null },
                isBot: false
            }
        },
        'Samsung Galaxy S23': {
            ua: 'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Mobile Safari/537.36',
            output: {
                browser: { name: 'Chrome', version: '104.0.0.0', major: '104' },
                engine: { name: 'Blink', version: '104.0.0.0' },
                os: { name: 'Android', version: '13' },
                device: { type: 'mobile', vendor: 'Samsung', model: 'SM-S911B' },
                cpu: { architecture: null },
                isBot: false
            }
        }
    },

    'Android - Google Pixel': {
        'Google Pixel 9 Pro': {
            ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 9 Pro Build/AD1A.240418.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.54 Mobile Safari/537.36',
            output: {
                browser: { name: 'Chrome', version: '124.0.6367.54', major: '124' },
                engine: { name: 'Blink', version: '124.0.6367.54' },
                os: { name: 'Android', version: '14' },
                device: { type: 'mobile', vendor: 'Google', model: 'Pixel 9 Pro' },
                cpu: { architecture: null },
                isBot: false
            }
        },
        'Google Pixel 8 Pro': {
            ua: 'Mozilla/5.0 (Linux; Android 15; Pixel 8 Pro Build/AP4A.250105.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/132.0.6834.163 Mobile Safari/537.36',
            output: {
                browser: { name: 'Chrome', version: '132.0.6834.163', major: '132' },
                engine: { name: 'Blink', version: '132.0.6834.163' },
                os: { name: 'Android', version: '15' },
                device: { type: 'mobile', vendor: 'Google', model: 'Pixel 8 Pro' },
                cpu: { architecture: null },
                isBot: false
            }
        }
    },

    'Android - Xiaomi': {
        'Xiaomi 14 Ultra': {
            ua: 'Mozilla/5.0 (Linux; Android 14; 24030PN60G Build/UKQ1.231003.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.6261.119 Mobile Safari/537.36',
            output: {
                browser: { name: 'Chrome', version: '122.0.6261.119', major: '122' },
                engine: { name: 'Blink', version: '122.0.6261.119' },
                os: { name: 'Android', version: '14' },
                device: { type: 'mobile', vendor: 'Xiaomi', model: '24030PN60G' },
                cpu: { architecture: null },
                isBot: false
            }
        },
        'Redmi Note 9 Pro': {
            ua: 'Mozilla/5.0 (Linux; Android 12; Redmi Note 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
            output: {
                browser: { name: 'Chrome', version: '112.0.0.0', major: '112' },
                engine: { name: 'Blink', version: '112.0.0.0' },
                os: { name: 'Android', version: '12' },
                device: { type: 'mobile', vendor: 'Xiaomi', model: null },
                cpu: { architecture: null },
                isBot: false
            }
        }
    },

    'Desktop Browsers': {
        'Windows 10 Edge': {
            ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0',
            output: {
                browser: { name: 'Edge', version: '134.0.0.0', major: '134' },
                engine: { name: 'Blink', version: '134.0.0.0' },
                os: { name: 'Windows', version: '10' },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: 'amd64' },
                isBot: false
            }
        },
        'Chrome OS Chromebook': {
            ua: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
            output: {
                browser: { name: 'Chrome', version: '134.0.0.0', major: '134' },
                engine: { name: 'Blink', version: '134.0.0.0' },
                os: { name: 'Chrome OS', version: '14541.0.0' },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: 'amd64' },
                isBot: false
            }
        },
        'Linux Ubuntu Firefox': {
            ua: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:15.0) Gecko/20100101 Firefox/15.0.1',
            output: {
                browser: { name: 'Firefox', version: '15.0.1', major: '15' },
                engine: { name: 'Gecko', version: '20100101' },
                os: { name: 'Ubuntu', version: null },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: 'amd64' },
                isBot: false
            }
        }
    },

    'Tablets': {
        'Apple iPad Pro': {
            ua: 'Mozilla/5.0 (iPad16,3; CPU OS 18_3_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Tropicana_NJ/5.7.1',
            output: {
                browser: { name: null, version: null, major: null },
                engine: { name: 'WebKit', version: '605.1.15' },
                os: { name: 'iOS', version: '18.3.2' },
                device: { type: 'tablet', vendor: 'Apple', model: 'iPad' },
                cpu: { architecture: null },
                isBot: false
            }
        },
        'Sony Xperia Z4 Tablet': {
            ua: 'Mozilla/5.0 (Linux; Android 6.0.1; SGP771 Build/32.2.A.0.253; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/52.0.2743.98 Safari/537.36',
            output: {
                browser: { name: 'Chrome', version: '52.0.2743.98', major: '52' },
                engine: { name: 'Blink', version: '52.0.2743.98' },
                os: { name: 'Android', version: '6.0.1' },
                device: { type: 'tablet', vendor: 'Sony', model: 'SGP771' },
                cpu: { architecture: null },
                isBot: false
            }
        }
    },

    'Set Top Boxes': {
        'Apple TV': {
            ua: 'AppleTV14,1/16.1',
            output: {
                browser: { name: null, version: null, major: null },
                engine: { name: null, version: null },
                os: { name: null, version: null },
                device: { type: 'smarttv', vendor: 'Apple', model: null },
                cpu: { architecture: null },
                isBot: false
            }
        },
        'Chromecast': {
            ua: 'Mozilla/5.0 (CrKey armv7l 1.5.16041) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/31.0.1650.0 Safari/537.36',
            output: {
                browser: { name: 'Chrome', version: '31.0.1650.0', major: '31' },
                engine: { name: 'Blink', version: '31.0.1650.0' },
                os: { name: null, version: null },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: 'arm' },
                isBot: false
            }
        }
    },

    'E-Readers': {
        'Amazon Kindle 4': {
            ua: 'Mozilla/5.0 (X11; U; Linux armv7l like Android; en-us) AppleWebKit/531.2+ (KHTML, like Gecko) Version/5.0 Safari/533.2+ Kindle/3.0+',
            output: {
                browser: { name: 'Safari', version: '5.0', major: '5' },
                engine: { name: 'WebKit', version: '531.2' },
                os: { name: 'Linux', version: null },
                device: { type: 'tablet', vendor: null, model: null },
                cpu: { architecture: 'arm' },
                isBot: false
            }
        }
    },

    'Windows Phone': {
        'Microsoft Lumia 650': {
            ua: 'Mozilla/5.0 (Windows Phone 10.0; Android 6.0.1; Microsoft; RM-1152) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2743.116 Mobile Safari/537.36 Edge/15.15254',
            output: {
                browser: { name: 'Edge', version: '15.15254', major: '15' },
                engine: { name: 'Blink', version: '52.0.2743.116' },
                os: { name: 'Android', version: '6.0.1' },
                device: { type: 'mobile', vendor: 'Microsoft', model: null },
                cpu: { architecture: null },
                isBot: false
            }
        }
    },

    'Edge Cases': {
        'empty string': {
            ua: '',
            output: {
                browser: { name: null, version: null, major: null },
                engine: { name: null, version: null },
                os: { name: null, version: null },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: null },
                isBot: false
            }
        },
        'random string': {
            ua: 'just some random text',
            output: {
                browser: { name: null, version: null, major: null },
                engine: { name: null, version: null },
                os: { name: null, version: null },
                device: { type: null, vendor: null, model: null },
                cpu: { architecture: null },
                isBot: false
            }
        },
        'Safari fallback detection (no Version prefix, no Chrome)': {
            // This UA has Safari but not Chrome and no Version/ prefix - triggers fallback Safari detection
            ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15',
            output: {
                browser: { name: 'Safari', version: '605.1.15', major: '605' },
                engine: { name: 'WebKit', version: '605.1.15' },
                os: { name: 'macOS', version: '10.15.7' },
                device: { type: null, vendor: 'Apple', model: null },
                cpu: { architecture: null },
                isBot: false
            }
        }
    },

    'Android - Legacy Google Devices': {
        'Google Nexus 5': {
            ua: 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Mobile Safari/537.36',
            output: {
                browser: { name: 'Chrome', version: '89.0.4389.82', major: '89' },
                engine: { name: 'Blink', version: '89.0.4389.82' },
                os: { name: 'Android', version: '6.0' },
                device: { type: 'mobile', vendor: 'Google', model: 'Nexus 5' },
                cpu: { architecture: null },
                isBot: false
            }
        },
        'Google Nexus 7': {
            ua: 'Mozilla/5.0 (Linux; Android 5.1.1; Nexus7 Build/LMY47V) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.158 Safari/537.36',
            output: {
                browser: { name: 'Chrome', version: '66.0.3359.158', major: '66' },
                engine: { name: 'Blink', version: '66.0.3359.158' },
                os: { name: 'Android', version: '5.1.1' },
                device: { type: 'tablet', vendor: 'Google', model: 'Nexus7' },
                cpu: { architecture: null },
                isBot: false
            }
        }
    }
};

// =============================================================================
// NULL/UNDEFINED SPECIAL CASES
// =============================================================================

const SPECIAL_CASES = {
    'null': {
        input: null,
        output: {
            browser: { name: null, version: null, major: null },
            engine: { name: null, version: null },
            os: { name: null, version: null },
            device: { type: null, vendor: null, model: null },
            cpu: { architecture: null },
            isBot: false,
            raw: null
        }
    },
    'undefined': {
        input: undefined,
        output: {
            browser: { name: null, version: null, major: null },
            engine: { name: null, version: null },
            os: { name: null, version: null },
            device: { type: null, vendor: null, model: null },
            cpu: { architecture: null },
            isBot: false,
            raw: null
        }
    }
};

// =============================================================================
// TEST RUNNER - Dynamically generates tests from TEST_CASES
// =============================================================================

describe('parseUserAgent', () => {
    // Generate tests dynamically from TEST_CASES
    Object.entries(TEST_CASES).forEach(([groupName, agents]) => {
        describe(groupName, () => {
            Object.entries(agents).forEach(([testName, { ua, output }]) => {
                test(testName, () => {
                    const result = parseUserAgent(ua);

                    // Check each expected property deeply
                    Object.entries(output).forEach(([category, expected]) => {
                        if (typeof expected === 'object' && expected !== null) {
                            Object.entries(expected).forEach(([prop, value]) => {
                                expect(result[category][prop]).toBe(value);
                            });
                        } else {
                            expect(result[category]).toBe(expected);
                        }
                    });
                });
            });
        });
    });

    // Special cases for null/undefined
    describe('Null and Undefined', () => {
        Object.entries(SPECIAL_CASES).forEach(([testName, { input, output }]) => {
            test(testName, () => {
                const result = parseUserAgent(input);
                Object.entries(output).forEach(([category, expected]) => {
                    if (typeof expected === 'object' && expected !== null) {
                        Object.entries(expected).forEach(([prop, value]) => {
                            expect(result[category][prop]).toBe(value);
                        });
                    } else {
                        expect(result[category]).toBe(expected);
                    }
                });
            });
        });
    });
});
