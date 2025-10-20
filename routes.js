const express = require('express');
const { authController, userController, fileController, pageController } = require('./controller');
const router = express.Router();

const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.userId) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ status: 'SESSION_EXPIRED', message: 'Bu işlem için oturum açmalısınız.' });
    res.redirect('/auth');
};

const isDirector = (req, res, next) => {
    if (res.locals.user && res.locals.user.accessLevel === 'PROJECT_DIRECTOR') return next();
    res.status(403).send('<h1>403 - Yetkisiz Erişim</h1><p>Bu alana erişiminiz engellenmiştir.</p><a href="/dashboard">Ana Panele Dön</a>');
};

// Sayfa Rotaları
router.get('/auth', pageController.getLoginPage);
router.get('/', isAuthenticated, pageController.getDashboardPage);
router.get('/dashboard', isAuthenticated, pageController.getDashboardPage);
router.get('/profile/configuration', isAuthenticated, pageController.getPreferencesPage);
router.get('/documents', isAuthenticated, pageController.getFilesPage);
router.get('/secure/icarus-terminal', isAuthenticated, isDirector, pageController.getIcarusTerminalPage);

// API Rotalarını /api/v1 altına al
const api = express.Router();
api.post('/session/register', authController.register);
api.post('/session/login', authController.login);
api.post('/session/logout', authController.logout);
api.put('/user/configuration', isAuthenticated, userController.updateProfileConfiguration);
api.get('/documents/retrieve/:uuid', isAuthenticated, fileController.retrieveDocument);
router.use('/api/v1', api);

module.exports = router;