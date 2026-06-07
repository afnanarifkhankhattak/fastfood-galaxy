require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// Serve customer frontend from ../frontend
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// Serve admin panel HTML from backend folder
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// -------------------- MongoDB Connection --------------------
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is not defined in .env file');
    process.exit(1);
}

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas'))
    .catch(err => {
        console.error('❌ MongoDB connection error:', err);
        process.exit(1);
    });

// -------------------- Mongoose Schemas --------------------
const menuItemSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    cat: { type: String, required: true, enum: ['burger', 'pizza', 'sides', 'drinks', 'desserts'] },
    img: { type: String, required: true },
    discount: { type: Number, default: 0 }
});
const MenuItem = mongoose.model('MenuItem', menuItemSchema);

const orderSchema = new mongoose.Schema({
    items: { type: Array, required: true },
    total: { type: Number, required: true },
    customer: {
        name: { type: String, required: true },
        phone: { type: String, required: true },
        orderType: { type: String, enum: ['delivery', 'pickup', 'dine-in'], required: true },
        address: { type: String, default: '' },
        tableNumber: { type: String, default: '' },
        notes: { type: String, default: '' }
    },
    createdAt: { type: Date, default: Date.now },
    status: { type: String, default: 'pending', enum: ['pending', 'completed', 'cancelled'] }
});
const Order = mongoose.model('Order', orderSchema);

// -------------------- Admin Auth (environment variables) --------------------
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'galaxy123';
const activeTokens = new Map();

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function requireAdminAuth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token || !activeTokens.has(token)) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }
    next();
}

// -------------------- Public API (customer) --------------------
app.get('/api/menu', async (req, res) => {
    try {
        const items = await MenuItem.find();
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/orders', async (req, res) => {
    console.log('📦 Order received:', req.body);
    const { items, total, customer } = req.body;
    
    if (!items || items.length === 0) {
        return res.status(400).json({ error: 'Cart is empty' });
    }
    if (!customer || !customer.name || !customer.phone || !customer.orderType) {
        console.log('❌ Missing customer fields');
        return res.status(400).json({ error: 'Customer information incomplete' });
    }
    
    try {
        const newOrder = new Order({ items, total, customer });
        console.log('🔄 Attempting to save order...');
        await newOrder.save();
        console.log('✅ Order saved with ID:', newOrder._id);
        res.status(201).json({ message: 'Order saved', orderId: newOrder._id });
    } catch (err) {
        console.error('❌ Error saving order:', err);
        res.status(500).json({ error: err.message });
    }
});

// -------------------- Admin API (protected) --------------------
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        const token = generateToken();
        activeTokens.set(token, { username, createdAt: Date.now() });
        setTimeout(() => activeTokens.delete(token), 24 * 60 * 60 * 1000);
        res.json({ success: true, token });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

app.post('/api/admin/logout', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) activeTokens.delete(token);
    res.json({ success: true });
});

app.get('/api/admin/orders', requireAdminAuth, async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/admin/orders/:id/status', requireAdminAuth, async (req, res) => {
    const { status } = req.body;
    const allowed = ['pending', 'completed', 'cancelled'];
    if (!allowed.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }
    try {
        const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!order) return res.status(404).json({ error: 'Order not found' });
        res.json({ message: 'Status updated', status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/menu', requireAdminAuth, async (req, res) => {
    try {
        const newItem = new MenuItem(req.body);
        await newItem.save();
        res.status(201).json(newItem);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/menu/:id', requireAdminAuth, async (req, res) => {
    try {
        const updated = await MenuItem.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updated) return res.status(404).json({ error: 'Item not found' });
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/menu/:id', requireAdminAuth, async (req, res) => {
    try {
        const deleted = await MenuItem.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Item not found' });
        res.json({ message: 'Item deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// -------------------- Seed default menu if empty --------------------
async function seedMenu() {
    const count = await MenuItem.countDocuments();
    if (count === 0) {
        const defaultItems = [
            { name: "Nebula Burger", price: 8.99, cat: "burger", img: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500", discount: 1 },
            { name: "Mars Pizza", price: 12.99, cat: "pizza", img: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500", discount: 0 },
            { name: "Comet Fries", price: 4.49, cat: "sides", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcThTHNzRHQkDyUefmoGMgIF4nYZYTaF3mG7Og&s", discount: 1 },
            { name: "Supernova Taco", price: 6.49, cat: "burger", img: "https://images.unsplash.com/photo-1552332386-f8dd00dc2f85?w=500", discount: 0 },
            { name: "Star Milkshake", price: 5.99, cat: "drinks", img: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=500", discount: 0 },
            { name: "Galaxy Brownie", price: 4.99, cat: "desserts", img: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=500", discount: 1 },
            { name: "Pluto Dog", price: 5.49, cat: "sides", img: "https://images.unsplash.com/photo-1598214886806-c87b84b7078b?w=500", discount: 0 },
            { name: "Rocket Wings", price: 9.99, cat: "sides", img: "https://static-content.owner.com/funnel/images/12bf167e-d44e-4756-bdf8-c9f891200916?v=4862976706", discount: 1 },
            { name: "Saturn Rings", price: 4.99, cat: "sides", img: "https://images.unsplash.com/photo-1639024471283-03518883512d?w=500", discount: 0 },
            { name: "Moon Cheese Pizza", price: 11.99, cat: "pizza", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRGmjPle1RbUBZ8fR6jxLIlcjlRDNKsyUnh1g&s", discount: 0 },
            { name: "Orbit Sandwich", price: 7.49, cat: "burger", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSc_-YTqpDyig5GQ5pEi0Y3jfhPm81QXrGhdw&s", discount: 1 },
            { name: "Solar Soda", price: 2.49, cat: "drinks", img: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500", discount: 0 },
            { name: "Gravity Pasta", price: 10.99, cat: "sides", img: "https://images.unsplash.com/photo-1473093226795-af9932fe5856?w=500", discount: 0 },
            { name: "Alien Nuggets", price: 6.99, cat: "sides", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSaeT-Ngh9yA1ttKMigvK3gqgMViHnen675ug&s", discount: 1 },
            { name: "Meteor Meatballs", price: 8.49, cat: "sides", img: "https://images.unsplash.com/photo-1529042410759-befb1204b468?w=500", discount: 0 },
            { name: "Cosmic Wrap", price: 7.99, cat: "burger", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTHGM8XCGPWWt6gH0e-RLUR5HUYKDdOl3abnA&s", discount: 0 },
            { name: "Black Hole Coffee", price: 3.99, cat: "drinks", img: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=500", discount: 1 },
            { name: "Stardust Salad", price: 6.99, cat: "sides", img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500", discount: 0 },
            { name: "Venus Veggie Burger", price: 8.49, cat: "burger", img: "https://images.unsplash.com/photo-1512152272829-e3139592d56f?w=500", discount: 0 },
            { name: "Pulsar Pancake", price: 7.49, cat: "desserts", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTmKELzPHIwSi0WCgYBJ-gpB82YSij2R4mNyA&s", discount: 1 },
            { name: "Titan Burrito", price: 9.49, cat: "burger", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRfRyKwtPPPrxXLFYdvXQ9nsIpugqrcddcHjw&s", discount: 0 },
            { name: "Zodiac Ice Cream", price: 4.49, cat: "desserts", img: "https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=500", discount: 0 },
            { name: "Astro Apple Pie", price: 5.99, cat: "desserts", img: "https://images.unsplash.com/photo-1568571780765-9276ac8b75a2?w=500", discount: 1 },
            { name: "Eclipse Donut", price: 3.49, cat: "desserts", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT67ujwSE1OPj8EQMfzI5PO02AveXxVyt0pMQ&s", discount: 0 },
            { name: "Nebula Nachos", price: 7.99, cat: "sides", img: "https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?w=500", discount: 0 },
            { name: "Deep Space Tea", price: 2.99, cat: "drinks", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRVFpWu_ncWPJFXgDFRvmmgZklMPTqbI3VI2Q&s", discount: 1 },
            { name: "Wormhole Waffles", price: 6.49, cat: "desserts", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQZDKmyOVuIjcJ-aVwKC-hU8Qmw86acCi2wrQ&s", discount: 0 },
            { name: "Galactic Garlic Bread", price: 4.99, cat: "sides", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ2FHrEWT4AlqXAOOE1v3PMM8i3S2I0Xql4eQ&s", discount: 0 },
            { name: "Big Bang BBQ Pizza", price: 14.99, cat: "pizza", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSh0RFtzUuD4iyGdjtkU3xpJUFBDVW0T3izew&s", discount: 1 },
            { name: "Nova Cheesecake", price: 6.99, cat: "desserts", img: "https://oficinadeinverno.com.br/cdn/shop/articles/gluten-free-new-york-cheesecake-1450985-hero-01-dc54f9daf38044238b495c7cefc191fa.jpg?v=1659309704", discount: 0 }
        ];
        await MenuItem.insertMany(defaultItems);
        console.log('✅ Default menu seeded (30 items)');
    }
}

// -------------------- Start Server --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    await seedMenu();
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`   Customer: http://localhost:${PORT}`);
    console.log(`   Admin: http://localhost:${PORT}/admin`);
    console.log(`   Admin login: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}`);
});