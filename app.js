const firebaseConfig = {
    apiKey: "AIzaSyBxJe0_07DB6gVN6hEfIVkLUjGxQYa7LUY",
    authDomain: "my-way-40443.firebaseapp.com",
    projectId: "my-way-40443",
    storageBucket: "my-way-40443.firebasestorage.app",
    messagingSenderId: "211531844969",
    appId: "1:211531844969:web:91993d7ca4129078f181f8"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ⚠️ تمت إزالة enableIndexedDbPersistence عن قصد لأنها كانت تمنع ظهور المنتجات للجميع عند الخطأ.

let cart = JSON.parse(localStorage.getItem('myway_cart')) || [];
let isAdmin = false;
let currentCategory = 'الكل';
let productImageUrl = '';
const WHATSAPP_NUMBER = '201068746284';

// Fallback data
const defaultCategories = ['أدوات تنظيف', 'عناية بالجسم', 'مستحضرات تجميل'];
const fallbackProducts = [
    { id: '1', name: 'منظف سوبر باور', price: 120, category: 'أدوات تنظيف', image: 'https://images.unsplash.com/photo-1584820927498-cafe2c1c6628?auto=format&fit=crop&q=80&w=300' },
    { id: '2', name: 'شامبو العناية الفائقة', price: 85, category: 'عناية بالجسم', image: 'https://images.unsplash.com/photo-1631729371254-42c2892f0e6e?auto=format&fit=crop&q=80&w=300' },
    { id: '3', name: 'عطر جولدن تاتش', price: 250, category: 'مستحضرات تجميل', image: 'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&q=80&w=300' }
];

let categories = JSON.parse(localStorage.getItem('myway_categories')) || defaultCategories;
let products = JSON.parse(localStorage.getItem('myway_products')) || fallbackProducts;

// Listen to categories from Firebase
db.collection("store").doc("categories").onSnapshot((docSnap) => {
    if (docSnap.exists) {
        categories = docSnap.data().list;
        localStorage.setItem('myway_categories', JSON.stringify(categories));
    } else {
        categories = defaultCategories;
        db.collection("store").doc("categories").set({ list: categories }).catch(e => console.error(e));
    }
    renderCategories();
    renderProducts();
}, (error) => {
    console.error("Firestore categories error:", error);
    alert("⚠️ فشل الاتصال بقاعدة البيانات. يرجى التأكد من تعديل قواعد الحماية (Rules) في Firebase.");
    categories = JSON.parse(localStorage.getItem('myway_categories')) || defaultCategories;
    renderCategories();
    renderProducts();
});

// Listen to products from Firebase
db.collection("products").onSnapshot((snapshot) => {
    // لا نمسح المنتجات الموجودة إذا كانت قاعدة البيانات فارغة تماماً
    if (!snapshot.empty) {
        const newProducts = [];
        snapshot.forEach((docSnap) => {
            newProducts.push({ id: docSnap.id, ...docSnap.data() });
        });
        products = newProducts;
        localStorage.setItem('myway_products', JSON.stringify(products));
        renderProducts();
    } else if (products.length === 0) {
        // إذا كان فارغاً ولا نملك منتجات مسبقة
        products = fallbackProducts;
        renderProducts();
    }
}, (error) => {
    console.error("Firestore products error:", error);
    alert("⚠️ تنبيه: لا يمكن قراءة المنتجات. المنتجات تظهر فقط على جهازك الحالي لأن قاعدة بيانات Firebase مغلقة.");
    products = JSON.parse(localStorage.getItem('myway_products')) || fallbackProducts;
    renderProducts();
});

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    renderCategories();
    renderProducts();
    updateCartCount();
    renderCart();

    document.getElementById('product-search-input').addEventListener('input', () => {
        renderProducts();
    });

    document.getElementById('product-image-input').addEventListener('change', async function (e) {
        const file = e.target.files[0];
        const statusSpan = document.getElementById('image-upload-status');
        const saveBtn = document.querySelector('#product-modal .btn-primary');

        if (file) {
            statusSpan.innerText = 'جاري رفع الصورة إلى الخادم... الرجاء الانتظار ⏳';
            statusSpan.style.color = '#e3a008';
            saveBtn.disabled = true;

            const formData = new FormData();
            formData.append("file", file);
            formData.append("upload_preset", "My Way");

            try {
                const response = await fetch(
                    "https://api.cloudinary.com/v1_1/dwkwwltkv/image/upload",
                    { method: "POST", body: formData }
                );

                const data = await response.json();

                if (data.secure_url) {
                    productImageUrl = data.secure_url;
                    statusSpan.innerText = 'تم رفع الصورة بنجاح ✔️';
                    statusSpan.style.color = 'var(--secondary)';
                } else {
                    throw new Error("No URL returned from Cloudinary");
                }
            } catch (error) {
                console.error("Upload error:", error);
                statusSpan.innerText = 'حدث خطأ أثناء رفع الصورة ❌';
                statusSpan.style.color = '#e74c3c';
            } finally {
                saveBtn.disabled = false;
            }
        } else {
            statusSpan.innerText = '';
            productImageUrl = '';
        }
    });

    // Handle old local data migration to Firebase
    const oldProducts = JSON.parse(localStorage.getItem('myway_products'));
    if (oldProducts && oldProducts.length > 0 && !localStorage.getItem('migrated_to_firebase')) {
        console.log("Migrating old products to Firebase...");
        localStorage.setItem('migrated_to_firebase', 'true');

        // Migrate categories
        const oldCategories = JSON.parse(localStorage.getItem('myway_categories'));
        if (oldCategories && oldCategories.length > 0) {
            db.collection("store").doc("categories").set({ list: oldCategories }).catch(e => console.error(e));
        }

        // Migrate products
        oldProducts.forEach(async (p) => {
            try {
                const docId = p.id ? String(p.id) : Date.now().toString();
                await db.collection("products").doc(docId).set({
                    name: p.name,
                    price: p.price,
                    category: p.category,
                    image: p.image || ''
                });
                console.log("Migrated product:", p.name);
            } catch (err) {
                console.error("Failed to migrate product:", p.name, err);
            }
        });
    }
});

function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('data-target') || link.dataset.target;
            if (!target) return;
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            document.querySelectorAll('.page-section').forEach(section => {
                section.classList.remove('active');
            });
            document.getElementById(target).classList.add('active');
            updateBackground(target);
            window.scrollTo(0, 0);
        });
    });
}

function updateBackground(section) {
    const body = document.body;
    if (section === 'home') {
        body.style.backgroundImage = "url('https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&q=80')";
    } else if (section === 'products') {
        body.style.backgroundImage = "url('https://images.unsplash.com/photo-1576426863848-c21f53c60b19?auto=format&fit=crop&q=80')";
    } else if (section === 'opportunity') {
        body.style.backgroundImage = "url('https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80')";
    }
}

function toggleAdmin() {
    if (!isAdmin) {
        const pass = prompt('الرجاء إدخال كلمة المرور لدخول وضع الإدارة:');
        if (pass !== '1357') {
            alert('كلمة المرور غير صحيحة!');
            return;
        }
    }

    isAdmin = !isAdmin;
    const adminBtn = document.querySelector('.admin-btn');
    const adminControls = document.getElementById('products-admin-controls');
    if (isAdmin) {
        adminBtn.classList.add('active-admin');
        adminBtn.innerHTML = '<i class="fas fa-times"></i> إغلاق الإدارة';
        adminControls.classList.remove('hidden');
    } else {
        adminBtn.classList.remove('active-admin');
        adminBtn.innerHTML = '<i class="fas fa-user-cog"></i> الإدارة';
        adminControls.classList.add('hidden');
    }
    renderCategories();
    renderProducts();
}

function renderCategories() {
    const container = document.getElementById('categories-tabs');
    if (!container) return;

    container.innerHTML = '';
    const allTab = document.createElement('div');
    allTab.className = `category-tab ${currentCategory === 'الكل' ? 'active' : ''}`;
    allTab.textContent = 'الكل';
    allTab.onclick = () => { currentCategory = 'الكل'; renderCategories(); renderProducts(); };
    container.appendChild(allTab);

    categories.forEach(cat => {
        const tab = document.createElement('div');
        tab.className = `category-tab ${currentCategory === cat ? 'active' : ''}`;
        const textSpan = document.createElement('span');
        textSpan.textContent = cat;
        tab.appendChild(textSpan);
        if (isAdmin) {
            const delBtn = document.createElement('button');
            delBtn.className = 'delete-cat-btn';
            delBtn.innerHTML = '<i class="fas fa-times"></i>';
            delBtn.onclick = (e) => { e.stopPropagation(); deleteCategory(cat); };
            tab.insertBefore(delBtn, textSpan);
        }
        tab.onclick = () => { currentCategory = cat; renderCategories(); renderProducts(); };
        container.appendChild(tab);
    });

    const select = document.getElementById('product-category-input');
    if (!select) return;

    select.innerHTML = '';
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        select.appendChild(opt);
    });
}

function showAddCategoryModal() {
    document.getElementById('category-name-input').value = '';
    document.getElementById('category-modal').classList.add('active');
}

function saveCategory() {
    const name = document.getElementById('category-name-input').value.trim();
    if (name && !categories.includes(name)) {
        const newCats = [...categories, name];

        // تحديث محلي فوري
        categories = newCats;
        saveData();
        renderCategories();
        closeModals();

        // إرسال للسيرفر في الخلفية
        db.collection("store").doc("categories").set({ list: newCats }).catch(e => {
            console.error(e);
            alert('⚠️ لم يتم رفع التصنيف للسيرفر (لكنه حُفظ بجهازك). تأكد من اتصالك بالإنترنت وصلاحيات Firebase.');
        });
    } else {
        alert('الرجاء إدخال اسم تصنيف صالح وغير مكرر');
    }
}

function deleteCategory(cat) {
    if (confirm(`هل أنت متأكد من حذف التصنيف "${cat}"؟ سيتم الاحتفاظ بالمنتجات للتحويل.`)) {
        const newCats = categories.filter(c => c !== cat);

        // تحديث محلي فوري
        categories = newCats;
        if (currentCategory === cat) currentCategory = 'الكل';
        saveData();
        renderCategories();
        renderProducts();

        // إرسال للسيرفر
        db.collection("store").doc("categories").set({ list: newCats }).catch(e => {
            console.error(e);
            alert('⚠️ لم يتم الحذف من السيرفر (لكنه حُذف من جهازك).');
        });
    }
}

function renderProducts() {
    const container = document.getElementById('products-grid');
    if (!container) return;

    container.innerHTML = '';

    const searchInput = document.getElementById('product-search-input');
    const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';

    let filteredProducts = products;
    if (currentCategory !== 'الكل') {
        filteredProducts = products.filter(p => p.category === currentCategory);
    }

    if (searchQuery) {
        filteredProducts = filteredProducts.filter(p => p.name.toLowerCase().includes(searchQuery));
    }

    if (filteredProducts.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding: 20px; font-size: 1.2rem; color: #777; width: 100%;">لا توجد منتجات مطابقة لبحثك</p>';
    }

    filteredProducts.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        let adminHtml = '';
        if (isAdmin) {
            adminHtml = `
                <div class="product-admin-actions">
                    <button class="edit-btn" onclick="showEditProductModal('${product.id}')"><i class="fas fa-edit"></i></button>
                    <button class="delete-btn" onclick="deleteProduct('${product.id}')"><i class="fas fa-trash"></i></button>
                </div>
            `;
        }
        const fallbackImage = 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&q=80&w=300';
        const imgUrl = product.image ? product.image : fallbackImage;
        card.innerHTML = `
            ${adminHtml}
            <img src="${imgUrl}" alt="${product.name}" class="product-image" onerror="this.src='${fallbackImage}'">
            <h3 class="product-name">${product.name}</h3>
            <p class="product-price">${product.price} ج.م</p>
            <button class="add-to-cart" onclick="addToCart('${product.id}')">
                <i class="fas fa-cart-plus"></i> أضف للسلة
            </button>
        `;
        container.appendChild(card);
    });
}

function showAddProductModal() {
    if (categories.length === 0) {
        alert('الرجاء إضافة تصنيف واحد على الأقل أولاً');
        return;
    }
    document.getElementById('product-modal-title').textContent = 'إضافة منتج';
    document.getElementById('product-id-input').value = '';
    document.getElementById('product-name-input').value = '';
    document.getElementById('product-price-input').value = '';
    document.getElementById('product-image-input').value = '';
    document.getElementById('image-upload-status').innerText = '';
    document.querySelector('#product-modal .btn-primary').disabled = false;
    productImageUrl = '';
    document.getElementById('product-modal').classList.add('active');
}

function showEditProductModal(id) {
    const product = products.find(p => p.id == id);
    if (!product) return;
    document.getElementById('product-modal-title').textContent = 'تعديل منتج';
    document.getElementById('product-id-input').value = product.id;
    document.getElementById('product-name-input').value = product.name;
    document.getElementById('product-price-input').value = product.price;
    document.getElementById('product-category-input').value = product.category;
    document.getElementById('product-image-input').value = '';
    document.getElementById('image-upload-status').innerText = '';
    document.querySelector('#product-modal .btn-primary').disabled = false;
    productImageUrl = product.image || '';
    document.getElementById('product-modal').classList.add('active');
}

function saveProduct() {
    const id = document.getElementById('product-id-input').value;
    const name = document.getElementById('product-name-input').value.trim();
    const price = parseFloat(document.getElementById('product-price-input').value);
    const category = document.getElementById('product-category-input').value;

    if (!name || isNaN(price) || !category) {
        alert('الرجاء ملء جميع الحقول المطلوبة بشكل صحيح');
        return;
    }

    const saveBtn = document.querySelector('#product-modal .btn-primary');
    saveBtn.disabled = true;

    const productData = { name, price, category, image: productImageUrl };
    const docId = id ? String(id) : Date.now().toString();

    // تحديث محلي صاروخي قبل أي انتظار
    if (id) {
        const index = products.findIndex(p => p.id == id);
        if (index !== -1) {
            products[index] = { id: docId, ...productData };
        }
    } else {
        products.push({ id: docId, ...productData });
    }
    saveData();
    renderProducts();
    closeModals();
    saveBtn.disabled = false;

    // الحفظ في سيرفر Firebase
    db.collection("products").doc(docId).set(productData).catch(error => {
        console.error("Error saving product: ", error);
        alert("⚠️ تم إضافة المنتج بجهازك، ولكن لم يتم رفعه للسيرفر بعد: " + error.message);
    });
}

function deleteProduct(id) {
    if (confirm('هل أنت متأكد من حذف هذا المنتج؟')) {
        // حذف فوري من الشاشة
        products = products.filter(p => p.id != id);
        cart = cart.filter(item => item.product.id != id);
        saveData();
        renderProducts();
        renderCart();
        updateCartCount();

        // أمر الحذف للسيرفر
        db.collection("products").doc(id).delete().catch(error => {
            console.error("Error deleting product: ", error);
            alert("⚠️ لم يتم حذفه من السيرفر، ولكن حُذف من جهازك: " + error.message);
        });
    }
}

function addToCart(productId) {
    const product = products.find(p => p.id == productId);
    if (!product) return;
    const existingItem = cart.find(item => item.product.id == productId);
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ product, quantity: 1 });
    }
    saveData();
    updateCartCount();
    renderCart();

    const btn = document.querySelector('.desktop-cart');
    if (btn) {
        btn.style.transform = 'scale(1.2)';
        setTimeout(() => btn.style.transform = 'scale(1)', 300);
    }
    const mobileBtnIcon = document.querySelector('.mobile-only .nav-icon');
    if (mobileBtnIcon) {
        mobileBtnIcon.style.transform = 'scale(1.2)';
        mobileBtnIcon.style.color = 'var(--primary)';
        setTimeout(() => {
            mobileBtnIcon.style.transform = 'scale(1)';
            mobileBtnIcon.style.color = '';
        }, 300);
    }
}

function updateCartQuantity(productId, delta) {
    const itemIndex = cart.findIndex(item => item.product.id == productId);
    if (itemIndex !== -1) {
        cart[itemIndex].quantity += delta;
        if (cart[itemIndex].quantity <= 0) {
            cart.splice(itemIndex, 1);
        }
        saveData();
        updateCartCount();
        renderCart();
    }
}

function removeFromCart(productId) {
    cart = cart.filter(item => item.product.id != productId);
    saveData();
    updateCartCount();
    renderCart();
}

function updateCartCount() {
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    const countEl = document.getElementById('cart-count');
    if (countEl) countEl.textContent = count;
    const countMobile = document.getElementById('cart-count-mobile');
    if (countMobile) countMobile.textContent = count;
}

function renderCart() {
    const container = document.getElementById('cart-items');
    if (!container) return;

    container.innerHTML = '';
    let total = 0;
    if (cart.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding: 20px; color: #777;">السلة فارغة</p>';
    } else {
        cart.forEach(item => {
            const itemTotal = item.product.price * item.quantity;
            total += itemTotal;
            const el = document.createElement('div');
            el.className = 'cart-item';
            el.innerHTML = `
                <div class="cart-item-info">
                    <div class="cart-item-title">${item.product.name}</div>
                    <div class="cart-item-price">${item.product.price} ج.م</div>
                </div>
                <div class="cart-item-controls">
                    <div class="qty-btn" onclick="updateCartQuantity('${item.product.id}', 1)">+</div>
                    <span style="font-weight:bold; width:20px; text-align:center;">${item.quantity}</span>
                    <div class="qty-btn" onclick="updateCartQuantity('${item.product.id}', -1)">-</div>
                    <div class="qty-btn remove-item" onclick="removeFromCart('${item.product.id}')"><i class="fas fa-trash"></i></div>
                </div>
            `;
            container.appendChild(el);
        });
    }
    document.getElementById('cart-total-price').textContent = `${total} ج.م`;
}

function toggleCart() {
    const sidebar = document.getElementById('cart-sidebar');
    const overlay = document.getElementById('cart-overlay');
    if (sidebar && overlay) {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }
}

function checkoutWhatsApp() {
    if (cart.length === 0) {
        alert('السلة فارغة! الرجاء إضافة منتجات أولاً.');
        return;
    }
    let message = 'مرحباً، أود طلب المنتجات التالية:\n\n';
    let total = 0;
    cart.forEach((item, index) => {
        const itemTotal = item.product.price * item.quantity;
        total += itemTotal;
        message += `${index + 1}. ${item.product.name} - ${item.quantity}x (${item.product.price} ج.م) = ${itemTotal} ج.م\n`;
    });
    message += `\n*الإجمالي: ${total} ج.م*\n\nالرجاء إرسال تفاصيل التوصيل.`;
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
}

function closeModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

function saveData() {
    localStorage.setItem('myway_categories', JSON.stringify(categories));
    localStorage.setItem('myway_products', JSON.stringify(products));
    localStorage.setItem('myway_cart', JSON.stringify(cart));
}
