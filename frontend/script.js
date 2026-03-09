const API_URL = "http://localhost:8000";
let selectedImage = null;
let subcategoryMap = {}; // Global variable to store subcategories by gender

function handleKeyPress(event) {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

function searchProducts() {
    applyFilters();
}

// populate selects from API
async function loadFilterOptions() {
    try {
        const res = await fetch(`${API_URL}/filters`);
        if (!res.ok) throw new Error('Failed to fetch filters');
        const opts = await res.json();

        // Store the mapping globally from the backend
        subcategoryMap = opts.subcategory_map || {};

        const fill = (id, list) => {
            const sel = document.getElementById(id);
            if (!sel || !list) return;

            sel.innerHTML =
                '<option value="">Any</option>' +
                list.map(v => `<option value="${v}">${v}</option>`).join('');
        };

        fill('gender', opts.gender);
        fill('category', opts.category);
        fill('subcategory', opts.subcategory); // Initially load all
        fill('size', opts.size);

        // Listen for changes on the Gender dropdown
        const genderSelect = document.getElementById("gender");
        if (genderSelect) {
            genderSelect.addEventListener("change", updateSubcategories);
        }

    } catch(err) {
        console.warn('Could not load filter options', err);
    }
}

// Function to dynamically update subcategory dropdown based on gender
function updateSubcategories() {
    const gender = document.getElementById('gender').value.toLowerCase();
    const subcatSelect = document.getElementById('subcategory');
    if (!subcatSelect) return;

    let options = [];
    
    if (gender === 'male') {
        options = subcategoryMap['male'] || [];
    } else if (gender === 'female') {
        options = subcategoryMap['female'] || [];
    } else if (gender === 'unisex') {
        // Show male, female, and unisex styles when "Unisex" is selected
        const m = subcategoryMap['male'] || [];
        const f = subcategoryMap['female'] || [];
        const u = subcategoryMap['unisex'] || [];
        options = [...new Set([...m, ...f, ...u])].sort(); // Combine and remove duplicates
    } else {
        // "Any" is selected -> show all
        const m = subcategoryMap['male'] || [];
        const f = subcategoryMap['female'] || [];
        const u = subcategoryMap['unisex'] || [];
        options = [...new Set([...m, ...f, ...u])].sort();
    }

    // Repopulate the subcategory dropdown
    subcatSelect.innerHTML = '<option value="">Any</option>' + 
                             options.map(v => `<option value="${v}">${v}</option>`).join('');
}

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
    }

    selectedImage = file;

    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById("imagePreview");
        preview.innerHTML = `
            <div class="preview-item">
                <img src="${e.target.result}" alt="preview">
                <button class="remove-btn" onclick="removeImage()">✕</button>
            </div>
        `;
    };

    reader.readAsDataURL(file);
}

function removeImage() {
    selectedImage = null;
    document.getElementById("imageInput").value = '';
    document.getElementById("imagePreview").innerHTML = '';
}

function addMessage(content, isUser = false) {
    const chatBox = document.getElementById("chatBox");
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${isUser ? 'user' : 'assistant'}`;

    const contentDiv = document.createElement("div");
    contentDiv.className = "message-content";
    contentDiv.innerHTML = content;

    messageDiv.appendChild(contentDiv);
    chatBox.appendChild(messageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Fetching tips API logic 
async function fetchTips(product, index) {
    try {
        const res = await fetch(`${API_URL}/get-tips`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                product_name: product.brand,
                details: `${product.category} - ${product.subcategory}`,
                event_type: "casual"
            })
        });
        const data = await res.json();
        
        const tipEl = document.getElementById(`tips-${index}`);
        const disEl = document.getElementById(`disadvantage-${index}`);
        
        if (tipEl) tipEl.innerHTML = `💡 <strong>Pro Tip:</strong> ${data.pro_tip}`;
        if (disEl) disEl.innerHTML = `⚠️ <strong>Limitation:</strong> ${data.disadvantage}`;
    } catch (e) {
        console.error("Error fetching tips:", e);
        const tipEl = document.getElementById(`tips-${index}`);
        if (tipEl) tipEl.innerHTML = `💡 <strong>Pro Tip:</strong> Style it with confidence!`;
    }
}

async function applyFilters() {
    console.log("applyFilters called");

    const filters = {};
    const gender = document.getElementById("gender").value;
    if (gender) filters.gender = gender;

    const category = document.getElementById("category").value;
    if (category) filters.category = category;

    const subcategory = document.getElementById("subcategory").value;
    if (subcategory) filters.subcategory = subcategory;

    const size = document.getElementById("size").value;
    if (size) filters.size = size;

    const brand = document.getElementById("brand").value;
    if (brand) filters.brand = brand;

    const minPrice = document.getElementById("min_price").value;
    if (minPrice) filters.min_price = minPrice;

    const maxPrice = document.getElementById("max_price").value;
    if (maxPrice) filters.max_price = maxPrice;

    const minRating = document.getElementById("min_rating").value;
    if (minRating) filters.min_rating = minRating;

    console.log("Filters:", filters);

    const filterText =
        Object.keys(filters).length > 0
        ? `Searching with filters: ${Object.entries(filters).map(([k,v]) => `${k}=${v}`).join(', ')}`
        : 'Showing all products...';

    addMessage(`🔍 ${filterText}`);
    addMessage("🤖 Let me check the fashion catalogue... please wait...");

    try {
        const response = await fetch(`${API_URL}/search-products`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(filters)
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const products = data.products;

        if (!products || products.length === 0) {
            addMessage(`❌ No products found for your filters.`);
            return;
        }

        addMessage(`✅ Found ${products.length} matching products:`);

        products.forEach((product, index) => {
            const productHTML = `
            <div class="product-card">
                <div class="product-name">
                    🛍️ <strong>${product.brand}</strong>
                </div>
                <div class="product-details">
                    <span><strong>Price:</strong> ₹${product.min_price} - ₹${product.max_price}</span> |
                    <span><strong>Rating:</strong> ${product.rating}/5</span> |
                    <span><strong>Score:</strong> ${product.score.toFixed(2)}</span>
                    <br>
                    <span><strong>Category:</strong> ${product.category}</span> •
                    <span><strong>Subcategory:</strong> ${product.subcategory}</span>
                    <br>
                    <span><strong>Size:</strong> ${product.size}</span> •
                    <span><strong>Brand:</strong> ${product.brand}</span>
                </div>
                <div id="tips-${index}" class="product-tip">
                    <strong>⏳ Loading tips...</strong>
                </div>
                <div id="disadvantage-${index}" class="product-disadvantage"></div>
            </div>
            `;
            addMessage(productHTML);
            
            // Trigger background API logic to replace placeholder 
            fetchTips(product, index);
        });

    } catch (error) {
        console.error("Error:", error);
        addMessage(`❌ Error: ${error.message}`);
    }
}

// initialize
window.addEventListener('DOMContentLoaded', () => {
    loadFilterOptions();
});

async function sendMessage() {
    let message = document.getElementById("userInput").value.trim();

    if (!message && selectedImage) {
        message = "Analyze this fashion image and give styling advice.";
    }

    if (!message && !selectedImage) return;
    if (message) addMessage(message, true);

    if (selectedImage) {
        const reader = new FileReader();
        reader.onload = (e) => {
            addMessage(`<img src="${e.target.result}" style="max-width:250px;border-radius:8px;">`, true);
        };
        reader.readAsDataURL(selectedImage);
    }

    document.getElementById("userInput").value = "";

    try {
        if (selectedImage) {
            const formData = new FormData();
            formData.append('file', selectedImage);
            formData.append('prompt', message);

            const response = await fetch(`${API_URL}/analyze-image`, {
                method: "POST",
                body: formData
            });

            const data = await response.json();
            const formatted = data.analysis.replace(/\n/g, '<br>');
            addMessage(`🤔SRI AI: ${formatted}`);
            removeImage();
        } else {
            const response = await fetch(`${API_URL}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: message })
            });

            const data = await response.json();
            
            // Check for API errors before replacing elements
            if (data.reply) {
                const formatted = data.reply.replace(/\n/g, '<br>');
                addMessage(`🤔SRI AI: ${formatted}`);
            } else {
                addMessage(`❌ Error from AI: No reply received.`);
            }
        }
    } catch(error) {
        addMessage(`❌ Error: ${error.message}`);
        console.error(error);
    }
}