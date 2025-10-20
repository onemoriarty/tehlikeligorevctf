
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    accessLevel: { type: String, default: 'TIER_1_ANALYST' },
    profileConfig: { type: mongoose.Schema.Types.Mixed, default: {} }
});

userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

const User = mongoose.model('User', userSchema);

const fileSchema = new mongoose.Schema({
    uuid: { type: String, required: true, unique: true },
    fileName: { type: String, required: true },
    content: { type: String, required: true },
    classification: { type: String, required: true }
});

const File = mongoose.model('File', fileSchema);

async function setupDatabase() {
    try {
        console.log(">>> Aeterna Dynamics veritabanı senkronizasyonu...");
        await File.deleteMany({});
        await File.create([
            {
                uuid: 'doc-gen-001a',
                fileName: 'Q4_Cafeteria_Menu.pdf',
                content: 'Haftalık menü güncellenmiştir. Afiyet olsun.',
                classification: 'TIER_1_ANALYST'
            },
            {
                uuid: 'doc-ikr-999z',
                fileName: 'IKARUS_CORE_DEVIATION_ANALYSIS.log',
                content: 'FLAG{ flag burda olcak}',
                classification: 'PROJECT_DIRECTOR'
            }
        ]);
        console.log(">>> Veri senkronizasyonu tamamlandı.");
    } catch (error) {
        console.error("XXX Veritabanı kurulum hatası:", error);
        process.exit(1);
    }
}

module.exports = { User, File, setupDatabase };