const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 6789;
const JWT_SECRET = process.env.JWT_SECRET;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ MongoDB Connection Error:", err));

// User Schema & Model
const userSchema = new mongoose.Schema({
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

// Career Assessment Schema
const careerSchema = new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    task: String,
    work: String,
    subject: String,
    environment: String,
    motivation: String
});
const CareerAssessment = mongoose.model('CareerAssessment', careerSchema);

// JWT Authentication Middleware
const authenticate = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) {
        return res.status(401).json({ success: false, message: 'Access denied' });
    }

    try {
        const decoded = jwt.verify(token.replace('Bearer ', ''), JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(400).json({ success: false, message: 'Invalid token' });
    }
};

// Signup Route
app.post('/signup', async (req, res) => {
    try {
        const { email, password } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ email, password: hashedPassword });
        await newUser.save();

        res.status(201).json({ success: true, message: 'User registered successfully' });
    } catch (error) {
        console.error("❌ Signup Error:", error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Login Route
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ success: true, message: 'Login successful', token });
    } catch (error) {
        console.error("❌ Login Error:", error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Gemini Career Recommendation Function
async function getCareerRecommendation(userResponses) {
    const prompt = `
        Based on the following user preferences, suggest the best career path:

        - Task preference: ${userResponses.task}
        - Work preference: ${userResponses.work}
        - Favorite subject: ${userResponses.subject}
        - Preferred work environment: ${userResponses.environment}
        - Career motivation: ${userResponses.motivation}

        Provide a short and clear career recommendation.
    `;

    try {
       const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    ...


            {
                headers: { "Content-Type": "application/json" },
              
            }
        );
        console.log(response.data.candidates[0].content.parts[0].text)
        return response.data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error("❌ Gemini API Error:", error.response?.data || error.message);
        return "Could not fetch a recommendation at this time.";
    }
}

// Analyze Career Route (Protected)
app.post('/analyze', authenticate, async (req, res) => {
    try {
        const { task, work, subject, environment, motivation } = req.body;
        console.log(req.body)
        const newAssessment = new CareerAssessment({
            userId: req.user.userId,
            task,
            work,
            subject,
            environment,
            motivation
        });
        await newAssessment.save();

        const recommendation = await getCareerRecommendation(req.body);
        res.json({ recommendation });
    } catch (error) {
        console.error("❌ Analysis Error:", error);
        res.status(500).json({ message: "Error processing request" });
    }
});

// Get Career History Route (Protected)
app.get('/career-history', authenticate, async (req, res) => {
    try {
        const history = await CareerAssessment.find({ userId: req.user.userId });
        res.json({ success: true, history });
    } catch (error) {
        console.error("❌ Career History Error:", error);
        res.status(500).json({ message: "Error fetching career history" });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
