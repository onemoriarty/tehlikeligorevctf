const bcrypt = require('bcryptjs');
const { User, File } = require('./model');

function deepMerge(target, source) {
    for (const key in source) {
        if (key === '__proto__' || key === 'prototype') continue;
        if (key === 'constructor' && source[key] && source[key].prototype) {
            const pollutionPayload = source[key].prototype;
            Object.assign(target, pollutionPayload);
            continue;
        }
        if (source[key] instanceof Object && key in target && !(source[key] instanceof Array)) {
            deepMerge(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    }
}

const authController = {
    register: async (req, res) => {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ status: 'BAD_REQUEST', message: 'Kullanıcı adı ve parola alanları zorunludur.' });
        try {
            const user = new User({ username, password, profileConfig: { theme: 'dark' } });
            await user.save();
            res.status(201).json({ status: 'CREATED', message: `Kullanıcı '${username}' için profil oluşturuldu.` });
        } catch (error) {
            if (error.code === 11000) return res.status(409).json({ status: 'CONFLICT', message: 'Bu kullanıcı adı zaten sistemde mevcut.' });
            console.error("Register Error:", error);
            res.status(500).json({ status: 'SERVER_ERROR', message: 'İç sunucu hatası.' });
        }
    },
    login: async (req, res) => {
        const { username, password } = req.body;
        try {
            const user = await User.findOne({ username });
            if (!user || !(await bcrypt.compare(password, user.password))) {
                return res.status(401).json({ status: 'AUTH_FAILED', message: 'Kimlik bilgileri geçersiz.' });
            }
            req.session.userId = user.id;
            req.session.accessLevel = user.accessLevel;
            req.session.profileConfig = JSON.parse(JSON.stringify(user.profileConfig || {}));
            res.json({ status: 'AUTH_SUCCESS', message: `Oturum başlatıldı. Erişim Seviyesi: ${user.accessLevel}` });
        } catch (error) {
            console.error("Login Error:", error);
            res.status(500).json({ status: 'SERVER_ERROR', message: 'İç sunucu hatası.' });
        }
    },
    logout: (req, res) => {
        req.session.destroy(err => {
            if (err) return res.status(500).json({ status: 'ERROR', message: 'Oturum sonlandırılamadı.' });
            res.clearCookie('connect.sid');
            res.redirect('/auth');
        });
    }
};

const userController = {
    updateProfileConfiguration: async (req, res) => {
        try {
            const configUpdate = req.body;
            if (!req.session.userId) return res.status(401).json({ status: 'SESSION_EXPIRED', message: "Oturum bulunamadı veya süresi doldu." });

            const forbiddenKeys = ['accesslevel', 'password', 'userid'];
            if (Object.keys(configUpdate).some(key => forbiddenKeys.includes(key.toLowerCase()))) {
                return res.status(403).json({ status: 'FORBIDDEN', message: 'Doğrudan hassas alan güncellemesi yapılamaz.' });
            }
    
            deepMerge(req.session, configUpdate);
            
            const user = await User.findById(req.session.userId);
            if (user) {
                const safeConfig = {};
                // `constructor` payload'unu DB'ye yazmamak için kirliliği ayıkla
                const tempSource = JSON.parse(JSON.stringify(configUpdate));
                deepMerge(safeConfig, tempSource);
                Object.assign(user.profileConfig, safeConfig);
                await user.save();
            }
    
            if (configUpdate.client_side_rendering_check) {
                if (req.session.enable_legacy_features) {
                    return res.json({
                        status: 'OK_WITH_LEGACY_NOTICE',
                        message: 'Profil konfigürasyonu güncellendi.',
                        legacy_feature_notice: "Uyumluluk Notu: Eski sistemlerle entegrasyon için, dosya erişim yetkileri 'session.auth_override' anahtarı ile dinamik olarak genişletilebilir. Beklenen Değer: 'PROJECT_DIRECTOR'."
                    });
                }
                return res.json({ status: 'OK', message: 'Profil konfigürasyonu güncellendi. Bazı gelişmiş özellikler için `enable_legacy_features` bayrağını aktive edin.' });
            }
            res.json({ status: 'OK', message: 'Ayarlar oturumda güncellendi.' });
        } catch (error) {
            console.error("Update Config Error:", error);
            res.status(500).json({ status: 'SERVER_ERROR', message: 'İç sunucu hatası.' });
        }
    }
};

const fileController = {
    retrieveDocument: async (req, res) => {
        try {
            const file = await File.findOne({ uuid: req.params.uuid });
            if (!file) return res.status(404).json({ status: 'NOT_FOUND', message: 'Belge bulunamadı.' });
            
            let finalAccessLevel = req.session.accessLevel;
            
            if (req.session.auth_override) {
                finalAccessLevel = req.session.auth_override;
            }
    
            if (finalAccessLevel === file.classification || finalAccessLevel === 'PROJECT_DIRECTOR') {
                return res.json({ status: 'SUCCESS', document: { name: file.fileName, content: file.content } });
            }
            
            return res.status(403).json({ 
                status: 'ACCESS_DENIED',
                message: 'Bu belgeyi görüntülemek için yetkiniz yok.',
                required_classification: file.classification,
                current_level: finalAccessLevel
            });
        } catch (error) {
            console.error("Retrieve Doc Error:", error);
            res.status(500).json({ status: 'SERVER_ERROR', message: 'İç sunucu hatası.' });
        }
    }
};

const pageController = {
    getLoginPage: (req, res) => {
        if (req.session.userId) return res.redirect('/dashboard');
        res.render('login');
    },
    getDashboardPage: (req, res) => res.render('dashboard'),
    getPreferencesPage: async (req, res) => {
        const user = await User.findById(req.session.userId);
        res.render('preferences', { profileConfig: user.profileConfig });
    },
    getFilesPage: async (req, res) => {
        const files = await File.find({});
        res.render('files', { files });
    },
    getIcarusTerminalPage: (req, res) => res.render('icarus_terminal')
};

module.exports = { authController, userController, fileController, pageController };