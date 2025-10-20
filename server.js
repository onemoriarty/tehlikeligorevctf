// server.js
'use strict';

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const { setupDatabase } = require('./model');
const pageRoutes = require('./routes');


const app = express();
const MONGO_URI = process.env.MONGO_URI || 'urlni koy';

// Flag to ensure setupDatabase runs only once across cold starts
if (!global.__IKARUS_DB_INITIALIZED__) {
  global.__IKARUS_DB_INITIALIZED__ = false;
}

/**
 * Ensure mongoose connection (with simple caching for serverless/cold starts)
 */
async function ensureDbConnected() {
  // 1 = connected, 2 = connecting
  if (mongoose.connection.readyState === 1) {
    return;
  }
  if (mongoose.connection.readyState === 2) {
    // already connecting; wait until connected
    await new Promise((resolve, reject) => {
      const check = () => {
        if (mongoose.connection.readyState === 1) return resolve();
        setTimeout(check, 50);
      };
      check();
      // Optional: add a timeout if desired
    });
    return;
  }

  // connect with recommended options
  await mongoose.connect(MONGO_URI, {
    // useNewUrlParser and useUnifiedTopology are default in modern mongoose versions
  });

  // run initial DB setup only once per process
  if (!global.__IKARUS_DB_INITIALIZED__) {
    await setupDatabase();
    global.__IKARUS_DB_INITIALIZED__ = true;
  }
}

async function initApp() {
  try {
    await ensureDbConnected();
    console.log('>>> MongoDB bağlantısı başarılı ve DB hazır.');

    app.set('view engine', 'ejs');

    // Vercel ve yerel aynı çalışsın: views dizinini proje kökünden al
    app.set('views', path.join(process.cwd(), 'views'));

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.use(session({
      secret: process.env.SESSION_SECRET || 'Ikarus_is_falling_down_a_dark_rabbit_hole_1377_v3_realistic_final_absolute',
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        mongoUrl: MONGO_URI,
        collectionName: 'sessions',
        // Optional: configure ttl and other options if needed
      }),
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 1000 * 60 * 60 // 1 saat
      }
    }));

    // Her request için res.locals.user ayarla (render sırasında kullanılacak)
    app.use(async (req, res, next) => {
      res.locals.user = null;
      if (req.session && req.session.userId) {
        try {
          const { User } = require('./model');
          res.locals.user = await User.findById(req.session.userId).lean();
        } catch (err) {
          console.error('Session user lookup error:', err);
          try { req.session.destroy(() => {}); } catch (e) {}
        }
      }
      next();
    });

    // Uygulama rotaları
    app.use('/', pageRoutes);

    // Local geliştirme: dinle
    if (!process.env.VERCEL) {
      const PORT = process.env.PORT || 3000;
      app.listen(PORT, () => {
        console.log(`>>> Proje IKARUS http://localhost:${PORT} adresinde başlatıldı.`);
      });
    }

  } catch (err) {
    console.error('XXX Sunucu başlatma hatası:', err);
    // Vercel'de process.exit çağırma; hata logları burada yeterli
    if (!process.env.VERCEL) {
      process.exit(1);
    }
  }
}

// Başlat (serverless ortamlarda module yüklendiğinde DB'nin bağlanmasını sağlar)
initApp().catch(err => {
  console.error('initApp fatal error:', err);
});

module.exports = app;
