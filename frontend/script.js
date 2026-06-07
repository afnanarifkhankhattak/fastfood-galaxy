let cart = [];
let total = 0;
let menuItems = [];
let currentOrderTotal = 0;
let currentCartItems = [];

// Fetch menu from backend
async function loadMenu() {
    try {
        const res = await fetch('/api/menu');
        menuItems = await res.json();
        renderMenu(menuItems);
    } catch (err) {
        console.error('Failed to load menu', err);
        showToast('Error loading menu. Please refresh.');
    }
}

function renderMenu(items) {
    const grid = document.getElementById('food-grid');
    grid.innerHTML = items.map(item => {
        const finalPrice = item.discount ? (item.price * 0.7).toFixed(2) : item.price.toFixed(2);
        let priceHTML = item.discount ? `<del>$${item.price.toFixed(2)}</del> $${finalPrice}` : `$${item.price.toFixed(2)}`;
        
        let description = "Cosmic flavors from the galaxy.";
        if (item.cat === "burger" || item.cat === "pizza") {
            description = "Experience the cosmic heat of bold spices and flame-grilled flavors.";
        } else if (item.cat === "desserts") {
            description = "Indulge in a stellar explosion of sweetness and rich, velvety textures.";
        } else if (item.cat === "drinks") {
            description = "Refresh your senses with a frosty, sub-zero blast of celestial flavors.";
        } else if (item.cat === "sides") {
            description = "The perfect gravitational pull for your meal—crispy, fresh, and savory.";
        }

        return `
            <div class="food-card" data-category="${item.cat}">
                ${item.discount ? '<div class="badge">30% OFF</div>' : ''}
                <img src="${item.img}" alt="${item.name}" loading="lazy">
                <div class="card-content">
                    <h3>${item.name}</h3>
                    <p>${description}</p>
                    <span class="price">${priceHTML}</span>
                    <button class="add-btn" onclick="addToCart('${item.name}', ${finalPrice})">Add to Cart</button>
                </div>
            </div>
        `;
    }).join('');

    // Scroll animations
    document.querySelectorAll('.food-card').forEach(card => {
        card.style.opacity = "0";
        card.style.transform = "translateY(50px)";
        card.style.transition = "all 0.6s ease-out";
        observer.observe(card);
    });
}

const observerOptions = { threshold: 0.1 };
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = "1";
            entry.target.style.transform = "translateY(0)";
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

function addToCart(name, price) {
    cart.push({ name, price: parseFloat(price) });
    total += parseFloat(price);
    document.getElementById('cart-count').innerText = cart.length;
    updateCartUI();
    showToast(`${name} added!`);
}

function updateCartUI() {
    const list = document.getElementById('cart-items');
    list.innerHTML = cart.map(item => `
        <li>
            <span>${item.name}</span>
            <span>$${item.price.toFixed(2)}</span>
        </li>
    `).join('');
    document.getElementById('cart-total').innerText = total.toFixed(2);
}

function toggleCart() {
    const modal = document.getElementById('cart-modal');
    modal.style.display = (modal.style.display === 'block') ? 'none' : 'block';
}

function filterItems(cat) {
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    const cards = document.querySelectorAll('.food-card');
    cards.forEach(card => {
        if (cat === 'all' || card.dataset.category === cat) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

// ---------- Customer Info Modal Functions ----------
function showCustomerModal() {
    if (cart.length === 0) {
        showToast('Your cart is empty!');
        return;
    }
    currentCartItems = [...cart];
    currentOrderTotal = total;
    document.getElementById('customer-modal').style.display = 'block';
}

function closeCustomerModal() {
    document.getElementById('customer-modal').style.display = 'none';
    document.getElementById('customer-form').reset();
    toggleOrderFields(); // reset visibility
}

function toggleOrderFields() {
    const orderType = document.getElementById('order-type').value;
    const addressGroup = document.getElementById('address-group');
    const tableGroup = document.getElementById('table-group');
    if (orderType === 'delivery') {
        addressGroup.style.display = 'block';
        tableGroup.style.display = 'none';
        document.getElementById('customer-address').required = true;
    } else if (orderType === 'dine-in') {
        addressGroup.style.display = 'none';
        tableGroup.style.display = 'block';
        document.getElementById('customer-address').required = false;
    } else { // pickup
        addressGroup.style.display = 'none';
        tableGroup.style.display = 'none';
        document.getElementById('customer-address').required = false;
    }
}

async function submitOrderWithDetails(event) {
    event.preventDefault();
    
    const customerName = document.getElementById('customer-name').value.trim();
    const customerPhone = document.getElementById('customer-phone').value.trim();
    const orderType = document.getElementById('order-type').value;
    let address = '';
    let tableNumber = '';
    
    if (orderType === 'delivery') {
        address = document.getElementById('customer-address').value.trim();
        if (!address) {
            showToast('Please enter delivery address');
            return;
        }
    } else if (orderType === 'dine-in') {
        tableNumber = document.getElementById('customer-table').value.trim();
    }
    
    const notes = document.getElementById('customer-notes').value.trim();
    
    const orderData = {
        items: currentCartItems,
        total: currentOrderTotal,
        customer: {
            name: customerName,
            phone: customerPhone,
            orderType: orderType,
            address: address,
            tableNumber: tableNumber,
            notes: notes
        }
    };
    
    try {
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });
        
        if (response.ok) {
            showToast('✅ Order placed successfully!');
            // Reset cart
            cart = [];
            total = 0;
            currentCartItems = [];
            currentOrderTotal = 0;
            updateCartUI();
            document.getElementById('cart-count').innerText = '0';
            closeCustomerModal();
            toggleCart(); // close cart modal if open
        } else {
            const err = await response.json();
            showToast(`❌ ${err.error || 'Failed to place order'}`);
        }
    } catch (err) {
        console.error(err);
        showToast('Server error. Check console.');
    }
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.innerText = msg;
    toast.style.cssText = "position:fixed; bottom:20px; right:20px; background:#00d2ff; color:#000; padding:12px 25px; border-radius:50px; font-weight:bold; z-index:9999; animation:slideIn 0.3s ease;";
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = "0"; setTimeout(() => toast.remove(), 500); }, 2500);
}

function toggleMobileMenu() {
    const nav = document.getElementById('nav-menu');
    if (window.innerWidth <= 768) {
        nav.classList.toggle('active');
    }
}

// Close modals when clicking outside
window.onclick = function(event) {
    const cartModal = document.getElementById('cart-modal');
    const customerModal = document.getElementById('customer-modal');
    if (event.target === cartModal) cartModal.style.display = 'none';
    if (event.target === customerModal) customerModal.style.display = 'none';
};

document.addEventListener('DOMContentLoaded', () => {
    loadMenu();
    document.querySelector('.cart-icon').addEventListener('click', toggleCart);
    document.getElementById('order-type').addEventListener('change', toggleOrderFields);
    document.getElementById('customer-form').addEventListener('submit', submitOrderWithDetails);
});