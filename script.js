document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('drawingCanvas');
    const ctx = canvas.getContext('2d');

    // State
    let isDrawing = false;
    let layers = [
        { id: 0, name: 'レイヤー 1', strokes: [], visible: true },
        { id: 1, name: 'レイヤー 2', strokes: [], visible: true },
        { id: 2, name: 'レイヤー 3', strokes: [], visible: true }
    ];
    let activeLayerId = 0;
    let redoStacks = [[], [], []];
    let currentStroke = null;
    let backgroundImage = null;

    let activeTool = 'line'; // 'line', 'dotted', 'tone', 'eraser'
    let activePattern = 'dot'; // 'dot', 'stripe'
    let activeEffects = {
        wobbly: false,
        outline: false,
        shadow: false,
        neon: false
    };
    let currentColor = '#FFB7B2';
    let currentSize = 5;
    let wobbleStrength = 2;
    let wobbleSpeed = 5;

    // Zoom State
    let canvasZoom = 1.0;
    const MIN_ZOOM = 0.25;
    const MAX_ZOOM = 2.0;

    // Pan State
    let isPanMode = false;
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    let canvasOffset = { x: 0, y: 0 };
    let isSpacePressed = false;

    // Color Presets - Organized by tone
    const colorPresets = {
        vivid: ['#FF0000', '#FF8800', '#FFD700', '#00FF00', '#00BFFF', '#6A00FF', '#FF1493', '#FFFFFF', '#000000'],
        pastel: ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#D4BAFF', '#FFBAF3', '#FFFFFF', '#000000'],
        dark: ['#8B0000', '#CC5500', '#B8860B', '#006400', '#00688B', '#4B0082', '#8B008B', '#FFFFFF', '#000000'],
        mono: ['#FFFFFF', '#E0E0E0', '#C0C0C0', '#A0A0A0', '#808080', '#606060', '#404040', '#202020', '#000000'],
        neon: ['#FF0080', '#FF3300', '#FFFF00', '#00FF00', '#00FFFF', '#8000FF', '#FF00FF', '#FFFFFF', '#000000']
    };

    // --- Initialization ---
    function initApp() {
        setupStartScreen();
        renderPresetTabs();
        renderLayerPanel();
        setupEventListeners();
        loadColorPreset('vivid');
        requestAnimationFrame(animate);
    }

    function setupStartScreen() {
        const startScreen = document.getElementById('start-screen');
        const appContainer = document.getElementById('app-container');
        const startCanvasBtn = document.getElementById('startCanvasBtn');
        const startImageBtn = document.getElementById('startImageBtn');
        const startImageLoader = document.getElementById('startImageLoader');
        const ratioBtns = document.querySelectorAll('.ratio-btn');
        const widthInput = document.getElementById('canvasWidth');
        const heightInput = document.getElementById('canvasHeight');

        // Aspect Ratio Buttons
        ratioBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                widthInput.value = btn.dataset.w;
                heightInput.value = btn.dataset.h;
            });
        });

        // Canvas Mode
        startCanvasBtn.addEventListener('click', () => {
            const width = parseInt(widthInput.value) || 800;
            const height = parseInt(heightInput.value) || 600;
            initCanvas(width, height);
            startScreen.style.display = 'none';
            appContainer.style.display = 'flex';
            backgroundImage = null;
        });

        // Image Mode
        startImageBtn.addEventListener('click', () => {
            startImageLoader.click();
        });

        startImageLoader.addEventListener('change', (e) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    // Fit canvas to image, but max out at window size roughly
                    let width = img.width;
                    let height = img.height;
                    const maxWidth = window.innerWidth * 0.8;
                    const maxHeight = window.innerHeight * 0.8;

                    if (width > maxWidth || height > maxHeight) {
                        const ratio = Math.min(maxWidth / width, maxHeight / height);
                        width *= ratio;
                        height *= ratio;
                    }

                    initCanvas(width, height);
                    backgroundImage = img;
                    startScreen.style.display = 'none';
                    appContainer.style.display = 'flex';
                };
                img.src = event.target.result;
            };
            if (e.target.files[0]) {
                reader.readAsDataURL(e.target.files[0]);
            }
        });
    }

    function initCanvas(width, height) {
        canvas.width = width;
        canvas.height = height;
        layers.forEach(layer => {
            layer.strokes = [];
        });
        redoStacks = [[], [], []];
    }

    function renderPresetTabs() {
        const list = document.getElementById('presetTabs');
        if (!list) return;
        list.innerHTML = '';

        Object.keys(colorPresets).forEach(key => {
            const btn = document.createElement('button');
            btn.className = 'tab-btn';
            if (key === 'vivid') btn.classList.add('active');
            btn.dataset.preset = key;
            btn.title = key;

            const miniPalette = document.createElement('div');
            miniPalette.className = 'mini-palette';
            colorPresets[key].forEach(color => {
                const dot = document.createElement('div');
                dot.className = 'mini-dot';
                dot.style.backgroundColor = color;
                miniPalette.appendChild(dot);
            });
            btn.appendChild(miniPalette);

            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                loadColorPreset(key);
            });

            list.appendChild(btn);
        });
    }

    function loadColorPreset(presetName) {
        const colors = colorPresets[presetName];
        const paletteContainer = document.getElementById('colorPalette');
        if (!paletteContainer) return;
        paletteContainer.innerHTML = '';

        colors.forEach(color => {
            const btn = document.createElement('button');
            btn.className = 'color-swatch'; // Use color-swatch class for styling
            btn.style.backgroundColor = color;
            btn.addEventListener('click', () => {
                currentColor = color;
                document.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
            if (color === currentColor) btn.classList.add('active');
            paletteContainer.appendChild(btn);
        });

        if (!colors.includes(currentColor)) {
            currentColor = colors[0];
            const firstBtn = paletteContainer.querySelector('.color-swatch');
            if (firstBtn) firstBtn.classList.add('active');
        }
    }

    function updateCanvasTransform() {
        const canvasWrapper = document.querySelector('.canvas-wrapper');
        if (canvasWrapper) {
            const transform = `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${canvasZoom})`;
            canvasWrapper.style.transform = transform;
        }
    }

    function setZoom(zoomValue) {
        canvasZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomValue));
        updateCanvasTransform();
        const zoomPercent = document.getElementById('zoomPercent');
        if (zoomPercent) {
            zoomPercent.textContent = Math.round(canvasZoom * 100) + '%';
        }
        const zoomSlider = document.getElementById('zoomSlider');
        if (zoomSlider) {
            zoomSlider.value = Math.round(canvasZoom * 100);
        }
    }

    function resetCanvasPosition() {
        canvasOffset = { x: 0, y: 0 };
        updateCanvasTransform();
    }

    function setPanMode(enabled) {
        isPanMode = enabled;
        const panBtn = document.getElementById('panBtn');
        const canvasWrapper = document.querySelector('.canvas-wrapper');

        if (panBtn) {
            if (enabled) {
                panBtn.classList.add('active');
            } else {
                panBtn.classList.remove('active');
            }
        }

        if (canvasWrapper) {
            if (enabled) {
                canvasWrapper.classList.add('pan-mode');
            } else {
                canvasWrapper.classList.remove('pan-mode');
                canvasWrapper.classList.remove('panning');
            }
        }
    }

    function renderLayerPanel() {
        const layerPanel = document.getElementById('layerPanel');
        if (!layerPanel) return;
        layerPanel.innerHTML = '';

        // Display layers in reverse order (bottom to top: 0, 1, 2)
        const reversedLayers = [...layers].reverse();

        reversedLayers.forEach((layer, reverseIndex) => {
            const index = layers.length - 1 - reverseIndex;
            const layerItem = document.createElement('div');
            layerItem.className = 'layer-item';
            layerItem.draggable = true;
            layerItem.dataset.layerId = index;

            if (index === activeLayerId) {
                layerItem.classList.add('active');
            }

            // Visibility Button
            const visBtn = document.createElement('button');
            visBtn.className = 'layer-visibility-btn';
            visBtn.innerHTML = layer.visible ? '👁️' : '👁️‍🗨️';
            visBtn.title = layer.visible ? '非表示にする' : '表示する';
            visBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                layer.visible = !layer.visible;
                renderLayerPanel();
            });

            // Layer Name
            const layerName = document.createElement('span');
            layerName.className = 'layer-name';
            layerName.textContent = layer.name;

            layerItem.appendChild(visBtn);
            layerItem.appendChild(layerName);

            // Click to activate layer
            layerItem.addEventListener('click', () => {
                activeLayerId = index;
                renderLayerPanel();
            });

            // Drag and Drop handlers
            layerItem.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', index.toString());
                layerItem.classList.add('dragging');
            });

            layerItem.addEventListener('dragend', (e) => {
                layerItem.classList.remove('dragging');
                // Remove all dragover highlights
                document.querySelectorAll('.layer-item').forEach(item => {
                    item.classList.remove('drag-over');
                });
            });

            layerItem.addEventListener('dragenter', (e) => {
                e.preventDefault();
                if (!layerItem.classList.contains('dragging')) {
                    layerItem.classList.add('drag-over');
                }
            });

            layerItem.addEventListener('dragleave', (e) => {
                e.preventDefault();
                layerItem.classList.remove('drag-over');
            });

            layerItem.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            });

            layerItem.addEventListener('drop', (e) => {
                e.preventDefault();
                layerItem.classList.remove('drag-over');

                const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                const toIndex = index;

                if (fromIndex !== toIndex && !isNaN(fromIndex)) {
                    // Swap layers
                    const fromLayer = layers[fromIndex];
                    const toLayer = layers[toIndex];
                    layers[fromIndex] = toLayer;
                    layers[toIndex] = fromLayer;

                    // Swap redo stacks
                    const fromRedo = redoStacks[fromIndex];
                    const toRedo = redoStacks[toIndex];
                    redoStacks[fromIndex] = toRedo;
                    redoStacks[toIndex] = fromRedo;

                    // Update active layer index
                    if (activeLayerId === fromIndex) {
                        activeLayerId = toIndex;
                    } else if (activeLayerId === toIndex) {
                        activeLayerId = fromIndex;
                    }

                    renderLayerPanel();
                }
            });

            layerPanel.appendChild(layerItem);
        });
    }

    function setupEventListeners() {
        // Drawing Events
        const startDrawing = (e) => {
            // Pan mode handling
            if (isPanMode || isSpacePressed) {
                isPanning = true;
                // タッチイベントとマウスイベントの両方に対応
                const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
                const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
                panStart = { x: clientX - canvasOffset.x, y: clientY - canvasOffset.y };
                const canvasWrapper = document.querySelector('.canvas-wrapper');
                if (canvasWrapper) {
                    canvasWrapper.classList.add('panning');
                }
                return;
            }

            isDrawing = true;
            const pos = getPos(e);
            currentStroke = {
                tool: activeTool,
                effects: { ...activeEffects },
                color: currentColor,
                size: currentSize,
                wobble: wobbleStrength,
                wobbleSpeed: wobbleSpeed,
                points: [{ x: pos.x, y: pos.y }],
                pattern: activePattern
            };
            layers[activeLayerId].strokes.push(currentStroke);
            redoStacks[activeLayerId] = [];
        };

        const moveDrawing = (e) => {
            // Pan mode handling
            if (isPanning) {
                // タッチイベントとマウスイベントの両方に対応
                const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
                const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
                canvasOffset.x = clientX - panStart.x;
                canvasOffset.y = clientY - panStart.y;
                updateCanvasTransform();
                return;
            }

            if (!isDrawing) return;
            const pos = getPos(e);
            currentStroke.points.push({ x: pos.x, y: pos.y });
        };

        const stopDrawing = () => {
            if (isPanning) {
                isPanning = false;
                const canvasWrapper = document.querySelector('.canvas-wrapper');
                if (canvasWrapper) {
                    canvasWrapper.classList.remove('panning');
                }
                return;
            }
            isDrawing = false;
            currentStroke = null;
        };

        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', moveDrawing);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseout', stopDrawing);

        canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDrawing(e.touches[0]); });
        canvas.addEventListener('touchmove', (e) => { e.preventDefault(); moveDrawing(e.touches[0]); });
        canvas.addEventListener('touchend', (e) => { e.preventDefault(); stopDrawing(); });

        // Tool Selection
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeTool = btn.dataset.tool;

                const patternGroup = document.getElementById('pattern-group');
                if (activeTool === 'tone') {
                    patternGroup.style.display = 'block'; // or flex
                } else {
                    patternGroup.style.display = 'none';
                }
            });
        });

        // Pattern Selection
        document.querySelectorAll('.pattern-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.pattern-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activePattern = btn.dataset.pattern;
            });
        });

        // Effect Selection
        document.querySelectorAll('.effect-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const effect = btn.dataset.effect;
                activeEffects[effect] = !activeEffects[effect];
                btn.classList.toggle('active', activeEffects[effect]);
            });
        });

        // Sliders
        document.getElementById('sizeSlider').addEventListener('input', (e) => {
            currentSize = parseInt(e.target.value);
        });
        document.getElementById('wobbleSlider').addEventListener('input', (e) => {
            wobbleStrength = parseInt(e.target.value);
        });
        const speedSlider = document.getElementById('wobbleSpeedSlider');
        if (speedSlider) {
            speedSlider.addEventListener('input', (e) => {
                wobbleSpeed = parseInt(e.target.value);
            });
        }

        // Undo/Redo/Clear
        document.getElementById('undoBtn').addEventListener('click', () => {
            const layer = layers[activeLayerId];
            if (layer.strokes.length > 0) {
                redoStacks[activeLayerId].push(layer.strokes.pop());
            }
        });
        document.getElementById('redoBtn').addEventListener('click', () => {
            const redoStack = redoStacks[activeLayerId];
            if (redoStack.length > 0) {
                layers[activeLayerId].strokes.push(redoStack.pop());
            }
        });
        document.getElementById('clearBtn').addEventListener('click', () => {
            layers[activeLayerId].strokes = [];
            redoStacks[activeLayerId] = [];
        });

        // Custom Confirm Dialog Function
        function showConfirmDialog(message) {
            return new Promise((resolve) => {
                const dialog = document.getElementById('confirmDialog');
                const confirmMessage = document.getElementById('confirmMessage');
                const okBtn = document.getElementById('confirmOk');
                const cancelBtn = document.getElementById('confirmCancel');

                if (message) {
                    confirmMessage.innerHTML = message;
                }

                dialog.classList.add('active');

                const handleOk = () => {
                    dialog.classList.remove('active');
                    okBtn.removeEventListener('click', handleOk);
                    cancelBtn.removeEventListener('click', handleCancel);
                    resolve(true);
                };

                const handleCancel = () => {
                    dialog.classList.remove('active');
                    okBtn.removeEventListener('click', handleOk);
                    cancelBtn.removeEventListener('click', handleCancel);
                    resolve(false);
                };

                okBtn.addEventListener('click', handleOk);
                cancelBtn.addEventListener('click', handleCancel);
            });
        }

        // Back to Start
        const backToStartBtn = document.getElementById('backToStartBtn');
        if (backToStartBtn) {
            backToStartBtn.addEventListener('click', async () => {
                const confirmed = await showConfirmDialog('ホームに戻りますか？<br>（描いた絵は消えてしまいます）');
                if (confirmed) {
                    document.getElementById('app-container').style.display = 'none';
                    document.getElementById('start-screen').style.display = 'flex';
                    layers.forEach(layer => layer.strokes = []);
                    redoStacks = [[], [], []];
                    backgroundImage = null;
                }
            });
        }

        // Export
        document.getElementById('exportBtn').addEventListener('click', exportGIF);

        // Zoom Controls
        const zoomSlider = document.getElementById('zoomSlider');
        const zoomInBtn = document.getElementById('zoomInBtn');
        const zoomOutBtn = document.getElementById('zoomOutBtn');
        const zoomResetBtn = document.getElementById('zoomResetBtn');

        if (zoomSlider) {
            zoomSlider.addEventListener('input', (e) => {
                setZoom(parseInt(e.target.value) / 100);
            });
        }

        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => {
                setZoom(canvasZoom + 0.1);
            });
        }

        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => {
                setZoom(canvasZoom - 0.1);
            });
        }

        if (zoomResetBtn) {
            zoomResetBtn.addEventListener('click', () => {
                setZoom(1.0);
                resetCanvasPosition();
            });
        }

        // Pan Button
        const panBtn = document.getElementById('panBtn');
        if (panBtn) {
            panBtn.addEventListener('click', () => {
                setPanMode(!isPanMode);
            });
        }

        // Keyboard Shortcuts
        document.addEventListener('keydown', (e) => {
            // Space key for temporary pan mode
            if (e.code === 'Space' && !isSpacePressed) {
                e.preventDefault();
                isSpacePressed = true;
                const canvasWrapper = document.querySelector('.canvas-wrapper');
                if (canvasWrapper && !isPanMode) {
                    canvasWrapper.classList.add('pan-mode');
                }
            }

            // Undo: Ctrl+Z or Cmd+Z
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                const layer = layers[activeLayerId];
                if (layer.strokes.length > 0) {
                    redoStacks[activeLayerId].push(layer.strokes.pop());
                }
            }

            // Redo: Ctrl+Shift+Z or Cmd+Shift+Z
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
                e.preventDefault();
                const redoStack = redoStacks[activeLayerId];
                if (redoStack.length > 0) {
                    layers[activeLayerId].strokes.push(redoStack.pop());
                }
            }
        });

        document.addEventListener('keyup', (e) => {
            // Release space key
            if (e.code === 'Space' && isSpacePressed) {
                isSpacePressed = false;
                const canvasWrapper = document.querySelector('.canvas-wrapper');
                if (canvasWrapper && !isPanMode) {
                    canvasWrapper.classList.remove('pan-mode');
                }
            }
        });

        // Sidebar Toggle Buttons
        const leftSidebarToggle = document.getElementById('leftSidebarToggle');
        const rightSidebarToggle = document.getElementById('rightSidebarToggle');
        const leftSidebar = document.querySelector('.left-sidebar');
        const rightSidebar = document.querySelector('.right-sidebar');

        if (leftSidebarToggle && leftSidebar) {
            leftSidebarToggle.addEventListener('click', () => {
                leftSidebar.classList.toggle('collapsed');
                // Update button icon
                if (leftSidebar.classList.contains('collapsed')) {
                    leftSidebarToggle.textContent = '▶';
                } else {
                    leftSidebarToggle.textContent = '◀';
                }
            });
        }

        if (rightSidebarToggle && rightSidebar) {
            rightSidebarToggle.addEventListener('click', () => {
                rightSidebar.classList.toggle('collapsed');
                // Update button icon
                if (rightSidebar.classList.contains('collapsed')) {
                    rightSidebarToggle.textContent = '◀';
                } else {
                    rightSidebarToggle.textContent = '▶';
                }
            });
        }
    }

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        // タッチイベントとマウスイベントの両方に対応
        const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
        const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    function animate() {
        // メインcanvasをクリア
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 背景を描画
        if (backgroundImage) {
            ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
        } else {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Quantized Time for 8 FPS (Choppy Effect)
        const time = Math.floor(Date.now() / 1000 * 8) / 8;

        // 各レイヤーを個別のオフスクリーンcanvasに描画してから重ね合わせる
        layers.forEach(layer => {
            if (!layer.visible) return;
            if (layer.strokes.length === 0) return; // ストロークがない場合はスキップ

            // オフスクリーンcanvasを作成
            const offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = canvas.width;
            offscreenCanvas.height = canvas.height;
            const offscreenCtx = offscreenCanvas.getContext('2d');

            // このレイヤーのストロークを描画
            layer.strokes.forEach(stroke => {
                if (stroke.tool === 'tone') {
                    drawTone(offscreenCtx, stroke, time);
                } else {
                    drawStroke(offscreenCtx, stroke, time);
                }
            });

            // オフスクリーンcanvasをメインcanvasに合成
            ctx.drawImage(offscreenCanvas, 0, 0);
        });

        requestAnimationFrame(animate);
    }

    function drawTone(context, stroke, time) {
        if (stroke.points.length < 3) return;

        context.save();
        context.beginPath();

        // Path (Dynamic Wobbly or Smooth)
        if (stroke.effects.wobbly) {
            const speed = stroke.wobbleSpeed || 5;
            const strength = stroke.wobble || 2;

            // Start point
            let p0 = stroke.points[0];
            let offsetX0 = Math.sin(time * speed + 0) * strength;
            let offsetY0 = Math.cos(time * speed + 0) * strength;
            context.moveTo(p0.x + offsetX0, p0.y + offsetY0);

            for (let i = 1; i < stroke.points.length; i++) {
                const p = stroke.points[i];
                // Calculate dynamic offset based on time and index
                const offsetX = Math.sin(time * speed + i * 0.5) * strength;
                const offsetY = Math.cos(time * speed + i * 0.5) * strength;
                context.lineTo(p.x + offsetX, p.y + offsetY);
            }
        } else {
            context.moveTo(stroke.points[0].x, stroke.points[0].y);
            for (let i = 1; i < stroke.points.length; i++) {
                context.lineTo(stroke.points[i].x, stroke.points[i].y);
            }
        }
        context.closePath();

        // Pattern
        const patternCanvas = document.createElement('canvas');
        const pCtx = patternCanvas.getContext('2d');

        // Pattern size based on stroke size
        const patternSize = Math.max(10, stroke.size * 2);
        patternCanvas.width = patternSize;
        patternCanvas.height = patternSize;
        pCtx.fillStyle = stroke.color;

        if (stroke.pattern === 'dot') {
            const dotRadius = Math.max(2, stroke.size / 3);
            pCtx.beginPath();
            pCtx.arc(patternSize / 2, patternSize / 2, dotRadius, 0, Math.PI * 2);
            pCtx.fill();
        } else if (stroke.pattern === 'stripe') {
            // Draw diagonal stripes as filled shapes
            const stripeWidth = Math.max(2, stroke.size / 2);
            pCtx.fillRect(0, 0, stripeWidth, patternSize);
            pCtx.fillRect(patternSize - stripeWidth, 0, stripeWidth, patternSize);
        } else if (stroke.pattern === 'solid') {
            pCtx.fillRect(0, 0, patternSize, patternSize);
        }

        const pattern = context.createPattern(patternCanvas, 'repeat');
        context.fillStyle = pattern;

        // Effects (Neon / Shadow)
        if (stroke.effects.neon) {
            context.shadowBlur = 10;
            context.shadowColor = stroke.color;
        } else if (stroke.effects.shadow) {
            context.shadowBlur = 5;
            context.shadowColor = 'rgba(0, 0, 0, 0.3)';
            context.shadowOffsetX = 5;
            context.shadowOffsetY = 5;
        }

        context.fill();

        // Outline Effect for Tone
        if (stroke.effects.outline) {
            context.lineWidth = 2;
            context.strokeStyle = stroke.color;
            context.stroke();
        }

        context.restore();
    }

    function drawStroke(context, stroke, time) {
        if (stroke.points.length < 2) return;

        context.save(); // コンテキスト状態を保存

        context.beginPath();
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.lineWidth = stroke.size;

        // 消しゴムツールの場合は透明にする
        if (stroke.tool === 'eraser') {
            context.globalCompositeOperation = 'destination-out';
            context.strokeStyle = 'rgba(0,0,0,1)'; // アルファ値を削除するため不透明な色を使用
        } else {
            context.globalCompositeOperation = 'source-over'; // 明示的に設定
            context.strokeStyle = stroke.color;
        }

        // Effects - 消しゴムの場合はエフェクトを適用しない
        if (stroke.tool !== 'eraser') {
            if (stroke.effects.neon) {
                context.shadowBlur = 10;
                context.shadowColor = stroke.color;
                context.shadowOffsetX = 0;
                context.shadowOffsetY = 0;
            } else if (stroke.effects.shadow) {
                context.shadowBlur = 5;
                context.shadowColor = 'rgba(0, 0, 0, 0.3)';
                context.shadowOffsetX = 5;
                context.shadowOffsetY = 5;
            }
        }

        if (stroke.tool === 'dotted') {
            context.setLineDash([stroke.size * 2, stroke.size * 2]);
        } else {
            context.setLineDash([]);
        }

        // Path (Dynamic Wobbly or Smooth)
        if (stroke.effects.wobbly) {
            const speed = stroke.wobbleSpeed || 5;
            const strength = stroke.wobble || 2;

            let p0 = stroke.points[0];
            let offsetX0 = Math.sin(time * speed + 0) * strength;
            let offsetY0 = Math.cos(time * speed + 0) * strength;
            context.moveTo(p0.x + offsetX0, p0.y + offsetY0);

            for (let i = 1; i < stroke.points.length; i++) {
                const p = stroke.points[i];
                const offsetX = Math.sin(time * speed + i * 0.5) * strength;
                const offsetY = Math.cos(time * speed + i * 0.5) * strength;
                context.lineTo(p.x + offsetX, p.y + offsetY);
            }
        } else {
            context.moveTo(stroke.points[0].x, stroke.points[0].y);
            for (let i = 1; i < stroke.points.length; i++) {
                context.lineTo(stroke.points[i].x, stroke.points[i].y);
            }
        }

        // Outline Effect - 消しゴムの場合はスキップ
        if (stroke.effects.outline && stroke.tool !== 'eraser') {
            context.save();
            context.lineWidth = stroke.size + 4;
            context.strokeStyle = '#FFFFFF';
            context.stroke();
            context.restore();
        }

        context.stroke();

        context.restore(); // コンテキスト状態を復元
    }

    async function exportGIF() {
        const exportBtn = document.getElementById('exportBtn');
        const originalText = exportBtn.innerText;
        exportBtn.innerText = '作成中...';
        exportBtn.disabled = true;

        try {
            // 1. Create Blob URL from embedded worker source
            const workerBlob = new Blob([gifWorkerSource], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(workerBlob);

            // 2. Resize Logic (Long edge max 1000px)
            const maxDim = 1000;
            let width = canvas.width;
            let height = canvas.height;
            let scale = 1;

            if (width > maxDim || height > maxDim) {
                scale = maxDim / Math.max(width, height);
                width = Math.round(width * scale);
                height = Math.round(height * scale);
            }

            // 3. Initialize GIF
            const gif = new GIF({
                workers: 2,
                quality: 10,
                width: width,
                height: height,
                workerScript: workerUrl
            });

            // 4. Rendering Loop (12 Frames)
            const resizeCanvas = document.createElement('canvas');
            resizeCanvas.width = width;
            resizeCanvas.height = height;
            const rCtx = resizeCanvas.getContext('2d');

            // Apply scale to context
            rCtx.scale(scale, scale);

            for (let i = 0; i < 12; i++) {
                // Clear
                rCtx.clearRect(0, 0, canvas.width, canvas.height);

                // Background
                if (backgroundImage) {
                    rCtx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
                } else {
                    rCtx.fillStyle = '#FFFFFF';
                    rCtx.fillRect(0, 0, canvas.width, canvas.height);
                }

                // Time for this frame (8 FPS)
                const time = i / 8;

                // Draw Strokes (all visible layers) - レイヤーごとに個別のcanvasに描画
                layers.forEach(layer => {
                    if (!layer.visible) return;
                    if (layer.strokes.length === 0) return;

                    // オフスクリーンcanvasを作成
                    const offscreenCanvas = document.createElement('canvas');
                    offscreenCanvas.width = canvas.width;
                    offscreenCanvas.height = canvas.height;
                    const offscreenCtx = offscreenCanvas.getContext('2d');
                    // スケールを適用
                    offscreenCtx.scale(scale, scale);

                    // このレイヤーのストロークを描画
                    layer.strokes.forEach(stroke => {
                        if (stroke.tool === 'tone') {
                            drawTone(offscreenCtx, stroke, time);
                        } else {
                            drawStroke(offscreenCtx, stroke, time);
                        }
                    });

                    // オフスクリーンcanvasをメインresizeCanvasに合成
                    // スケールをリセットして合成
                    rCtx.save();
                    rCtx.setTransform(1, 0, 0, 1, 0, 0);
                    rCtx.drawImage(offscreenCanvas, 0, 0);
                    rCtx.restore();
                });

                // Add Frame
                gif.addFrame(resizeCanvas, { delay: 125, copy: true });
            }

            gif.on('finished', async function (blob) {
                exportBtn.innerText = originalText;
                exportBtn.disabled = false;
                URL.revokeObjectURL(workerUrl); // Clean up

                try {
                    if (window.showSaveFilePicker) {
                        const handle = await window.showSaveFilePicker({
                            suggestedName: 'drawing.gif',
                            types: [{
                                description: 'GIF Image',
                                accept: { 'image/gif': ['.gif'] },
                            }],
                        });
                        const writable = await handle.createWritable();
                        await writable.write(blob);
                        await writable.close();
                    } else {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'drawing.gif';
                        a.click();
                        URL.revokeObjectURL(url);
                    }
                } catch (err) {
                    console.error('Save cancelled or failed:', err);
                }
            });

            gif.render();

        } catch (err) {
            console.error('Export failed:', err);
            alert('書き出しに失敗しました: ' + err.message);
            exportBtn.innerText = originalText;
            exportBtn.disabled = false;
        }
    }

    // Embedded gif.worker.js content
    const gifWorkerSource = `// gif.worker.js 0.2.0 - https://github.com/jnordberg/gif.js
(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){var NeuQuant=require("./TypedNeuQuant.js");var LZWEncoder=require("./LZWEncoder.js");function ByteArray(){this.page=-1;this.pages=[];this.newPage()}ByteArray.pageSize=4096;ByteArray.charMap={};for(var i=0;i<256;i++)ByteArray.charMap[i]=String.fromCharCode(i);ByteArray.prototype.newPage=function(){this.pages[++this.page]=new Uint8Array(ByteArray.pageSize);this.cursor=0};ByteArray.prototype.getData=function(){var rv="";for(var p=0;p<this.pages.length;p++){for(var i=0;i<ByteArray.pageSize;i++){rv+=ByteArray.charMap[this.pages[p][i]]}}return rv};ByteArray.prototype.writeByte=function(val){if(this.cursor>=ByteArray.pageSize)this.newPage();this.pages[this.page][this.cursor++]=val};ByteArray.prototype.writeUTFBytes=function(string){for(var l=string.length,i=0;i<l;i++)this.writeByte(string.charCodeAt(i))};ByteArray.prototype.writeBytes=function(array,offset,length){for(var l=length||array.length,i=offset||0;i<l;i++)this.writeByte(array[i])};function GIFEncoder(width,height){this.width=~~width;this.height=~~height;this.transparent=null;this.transIndex=0;this.repeat=-1;this.delay=0;this.image=null;this.pixels=null;this.indexedPixels=null;this.colorDepth=null;this.colorTab=null;this.neuQuant=null;this.usedEntry=new Array;this.palSize=7;this.dispose=-1;this.firstFrame=true;this.sample=10;this.dither=false;this.globalPalette=false;this.out=new ByteArray}GIFEncoder.prototype.setDelay=function(milliseconds){this.delay=Math.round(milliseconds/10)};GIFEncoder.prototype.setFrameRate=function(fps){this.delay=Math.round(100/fps)};GIFEncoder.prototype.setDispose=function(disposalCode){if(disposalCode>=0)this.dispose=disposalCode};GIFEncoder.prototype.setRepeat=function(repeat){this.repeat=repeat};GIFEncoder.prototype.setTransparent=function(color){this.transparent=color};GIFEncoder.prototype.addFrame=function(imageData){this.image=imageData;this.colorTab=this.globalPalette&&this.globalPalette.slice?this.globalPalette:null;this.getImagePixels();this.analyzePixels();if(this.globalPalette===true)this.globalPalette=this.colorTab;if(this.firstFrame){this.writeLSD();this.writePalette();if(this.repeat>=0){this.writeNetscapeExt()}}this.writeGraphicCtrlExt();this.writeImageDesc();if(!this.firstFrame&&!this.globalPalette)this.writePalette();this.writePixels();this.firstFrame=false};GIFEncoder.prototype.finish=function(){this.out.writeByte(59)};GIFEncoder.prototype.setQuality=function(quality){if(quality<1)quality=1;this.sample=quality};GIFEncoder.prototype.setDither=function(dither){if(dither===true)dither="FloydSteinberg";this.dither=dither};GIFEncoder.prototype.setGlobalPalette=function(palette){this.globalPalette=palette};GIFEncoder.prototype.getGlobalPalette=function(){return this.globalPalette&&this.globalPalette.slice&&this.globalPalette.slice(0)||this.globalPalette};GIFEncoder.prototype.writeHeader=function(){this.out.writeUTFBytes("GIF89a")};GIFEncoder.prototype.analyzePixels=function(){if(!this.colorTab){this.neuQuant=new NeuQuant(this.pixels,this.sample);this.neuQuant.buildColormap();this.colorTab=this.neuQuant.getColormap()}if(this.dither){this.ditherPixels(this.dither.replace("-serpentine",""),this.dither.match(/-serpentine/)!==null)}else{this.indexPixels()}this.pixels=null;this.colorDepth=8;this.palSize=7;if(this.transparent!==null){this.transIndex=this.findClosest(this.transparent,true)}};GIFEncoder.prototype.indexPixels=function(imgq){var nPix=this.pixels.length/3;this.indexedPixels=new Uint8Array(nPix);var k=0;for(var j=0;j<nPix;j++){var index=this.findClosestRGB(this.pixels[k++]&255,this.pixels[k++]&255,this.pixels[k++]&255);this.usedEntry[index]=true;this.indexedPixels[j]=index}};GIFEncoder.prototype.ditherPixels=function(kernel,serpentine){var kernels={FalseFloydSteinberg:[[3/8,1,0],[3/8,0,1],[2/8,1,1]],FloydSteinberg:[[7/16,1,0],[3/16,-1,1],[5/16,0,1],[1/16,1,1]],Stucki:[[8/42,1,0],[4/42,2,0],[2/42,-2,1],[4/42,-1,1],[8/42,0,1],[4/42,1,1],[2/42,2,1],[1/42,-2,2],[2/42,-1,2],[4/42,0,2],[2/42,1,2],[1/42,2,2]],Atkinson:[[1/8,1,0],[1/8,2,0],[1/8,-1,1],[1/8,0,1],[1/8,1,1],[1/8,0,2]]};if(!kernel||!kernels[kernel]){throw"Unknown dithering kernel: "+kernel}var ds=kernels[kernel];var index=0,height=this.height,width=this.width,data=this.pixels;var direction=serpentine?-1:1;this.indexedPixels=new Uint8Array(this.pixels.length/3);for(var y=0;y<height;y++){if(serpentine)direction=direction*-1;for(var x=direction==1?0:width-1,xend=direction==1?width:0;x!==xend;x+=direction){index=y*width+x;var idx=index*3;var r1=data[idx];var g1=data[idx+1];var b1=data[idx+2];idx=this.findClosestRGB(r1,g1,b1);this.usedEntry[idx]=true;this.indexedPixels[index]=idx;idx*=3;var r2=this.colorTab[idx];var g2=this.colorTab[idx+1];var b2=this.colorTab[idx+2];var er=r1-r2;var eg=g1-g2;var eb=b1-b2;for(var i=direction==1?0:ds.length-1,end=direction==1?ds.length:0;i!==end;i+=direction){var x1=ds[i][1];var y1=ds[i][2];if(x1+x>=0&&x1+x<width&&y1+y>=0&&y1+y<height){var d=ds[i][0];idx=index+x1+y1*width;idx*=3;data[idx]=Math.max(0,Math.min(255,data[idx]+er*d));data[idx+1]=Math.max(0,Math.min(255,data[idx+1]+eg*d));data[idx+2]=Math.max(0,Math.min(255,data[idx+2]+eb*d))}}}}};GIFEncoder.prototype.findClosest=function(c,used){return this.findClosestRGB((c&16711680)>>16,(c&65280)>>8,c&255,used)};GIFEncoder.prototype.findClosestRGB=function(r,g,b,used){if(this.colorTab===null)return-1;if(this.neuQuant&&!used){return this.neuQuant.lookupRGB(r,g,b)}var c=b|g<<8|r<<16;var minpos=0;var dmin=256*256*256;var len=this.colorTab.length;for(var i=0,index=0;i<len;index++){var dr=r-(this.colorTab[i++]&255);var dg=g-(this.colorTab[i++]&255);var db=b-(this.colorTab[i++]&255);var d=dr*dr+dg*dg+db*db;if((!used||this.usedEntry[index])&&d<dmin){dmin=d;minpos=index}}return minpos};GIFEncoder.prototype.getImagePixels=function(){var w=this.width;var h=this.height;this.pixels=new Uint8Array(w*h*3);var data=this.image;var srcPos=0;var count=0;for(var i=0;i<h;i++){for(var j=0;j<w;j++){this.pixels[count++]=data[srcPos++];this.pixels[count++]=data[srcPos++];this.pixels[count++]=data[srcPos++];srcPos++}}};GIFEncoder.prototype.writeGraphicCtrlExt=function(){this.out.writeByte(33);this.out.writeByte(249);this.out.writeByte(4);var transp,disp;if(this.transparent===null){transp=0;disp=0}else{transp=1;disp=2}if(this.dispose>=0){disp=dispose&7}disp<<=2;this.out.writeByte(0|disp|0|transp);this.writeShort(this.delay);this.out.writeByte(this.transIndex);this.out.writeByte(0)};GIFEncoder.prototype.writeImageDesc=function(){this.out.writeByte(44);this.writeShort(0);this.writeShort(0);this.writeShort(this.width);this.writeShort(this.height);if(this.firstFrame||this.globalPalette){this.out.writeByte(0)}else{this.out.writeByte(128|0|0|0|this.palSize)}};GIFEncoder.prototype.writeLSD=function(){this.writeShort(this.width);this.writeShort(this.height);this.out.writeByte(128|112|0|this.palSize);this.out.writeByte(0);this.out.writeByte(0)};GIFEncoder.prototype.writeNetscapeExt=function(){this.out.writeByte(33);this.out.writeByte(255);this.out.writeByte(11);this.out.writeUTFBytes("NETSCAPE2.0");this.out.writeByte(3);this.out.writeByte(1);this.writeShort(this.repeat);this.out.writeByte(0)};GIFEncoder.prototype.writePalette=function(){this.out.writeBytes(this.colorTab);var n=3*256-this.colorTab.length;for(var i=0;i<n;i++)this.out.writeByte(0)};GIFEncoder.prototype.writeShort=function(pValue){this.out.writeByte(pValue&255);this.out.writeByte(pValue>>8&255)};GIFEncoder.prototype.writePixels=function(){var enc=new LZWEncoder(this.width,this.height,this.indexedPixels,this.colorDepth);enc.encode(this.out)};GIFEncoder.prototype.stream=function(){return this.out};module.exports=GIFEncoder},{"./LZWEncoder.js":2,"./TypedNeuQuant.js":3}],2:[function(require,module,exports){var EOF=-1;var BITS=12;var HSIZE=5003;var masks=[0,1,3,7,15,31,63,127,255,511,1023,2047,4095,8191,16383,32767,65535];function LZWEncoder(width,height,pixels,colorDepth){var initCodeSize=Math.max(2,colorDepth);var accum=new Uint8Array(256);var htab=new Int32Array(HSIZE);var codetab=new Int32Array(HSIZE);var cur_accum,cur_bits=0;var a_count;var free_ent=0;var maxcode;var clear_flg=false;var g_init_bits,ClearCode,EOFCode;function char_out(c,outs){accum[a_count++]=c;if(a_count>=254)flush_char(outs)}function cl_block(outs){cl_hash(HSIZE);free_ent=ClearCode+2;clear_flg=true;output(ClearCode,outs)}function cl_hash(hsize){for(var i=0;i<hsize;++i)htab[i]=-1}function compress(init_bits,outs){var fcode,c,i,ent,disp,hsize_reg,hshift;g_init_bits=init_bits;clear_flg=false;n_bits=g_init_bits;maxcode=MAXCODE(n_bits);ClearCode=1<<init_bits-1;EOFCode=ClearCode+1;free_ent=ClearCode+2;a_count=0;ent=nextPixel();hshift=0;for(fcode=HSIZE;fcode<65536;fcode*=2)++hshift;hshift=8-hshift;hsize_reg=HSIZE;cl_hash(hsize_reg);output(ClearCode,outs);outer_loop:while((c=nextPixel())!=EOF){fcode=(c<<BITS)+ent;i=c<<hshift^ent;if(htab[i]===fcode){ent=codetab[i];continue}else if(htab[i]>=0){disp=hsize_reg-i;if(i===0)disp=1;do{if((i-=disp)<0)i+=hsize_reg;if(htab[i]===fcode){ent=codetab[i];continue outer_loop}}while(htab[i]>=0)}output(ent,outs);ent=c;if(free_ent<1<<BITS){codetab[i]=free_ent++;htab[i]=fcode}else{cl_block(outs)}}output(ent,outs);output(ent,outs);output(EOFCode,outs)}function encode(outs){outs.writeByte(initCodeSize);remaining=width*height;curPixel=0;compress(initCodeSize+1,outs);outs.writeByte(0)}function flush_char(outs){if(a_count>0){outs.writeByte(a_count);outs.writeBytes(accum,0,a_count);a_count=0}}function MAXCODE(n_bits){return(1<<n_bits)-1}function nextPixel(){if(remaining===0)return EOF;--remaining;var pix=pixels[curPixel++];return pix&255}function output(code,outs){cur_accum&=masks[cur_bits];if(cur_bits>0)cur_accum|=code<<cur_bits;else cur_accum=code;cur_bits+=n_bits;while(cur_bits>=8){char_out(cur_accum&255,outs);cur_accum>>=8;cur_bits-=8}if(free_ent>maxcode||clear_flg){if(clear_flg){maxcode=MAXCODE(n_bits=g_init_bits);clear_flg=false}else{++n_bits;if(n_bits==BITS)maxcode=1<<BITS;else maxcode=MAXCODE(n_bits)}}if(code==EOFCode){while(cur_bits>0){char_out(cur_accum&255,outs);cur_accum>>=8;cur_bits-=8}flush_char(outs)}}this.encode=encode}module.exports=LZWEncoder},{}],3:[function(require,module,exports){var ncycles=100;var netsize=256;var maxnetpos=netsize-1;var netbiasshift=4;var intbiasshift=16;var intbias=1<<intbiasshift;var gammashift=10;var gamma=1<<gammashift;var betashift=10;var beta=intbias>>betashift;var betagamma=intbias<<gammashift-betashift;var initrad=netsize>>3;var radiusbiasshift=6;var radiusbias=1<<radiusbiasshift;var initradius=initrad*radiusbias;var radiusdec=30;var alphabiasshift=10;var initalpha=1<<alphabiasshift;var alphadec;var radbiasshift=8;var radbias=1<<radbiasshift;var alpharadbshift=alphabiasshift+radbiasshift;var alpharadbias=1<<alpharadbshift;var prime1=499;var prime2=491;var prime3=487;var prime4=503;var minpicturebytes=3*prime4;function NeuQuant(pixels,samplefac){var network;var netindex;var bias;var freq;var radpower;function init(){network=[];netindex=new Int32Array(256);bias=new Int32Array(netsize);freq=new Int32Array(netsize);radpower=new Int32Array(netsize>>3);var i,v;for(i=0;i<netsize;i++){v=(i<<netbiasshift+8)/netsize;network[i]=new Float64Array([v,v,v,0]);freq[i]=intbias/netsize;bias[i]=0}}function unbiasnet(){for(var i=0;i<netsize;i++){network[i][0]>>=netbiasshift;network[i][1]>>=netbiasshift;network[i][2]>>=netbiasshift;network[i][3]=i}}function altersingle(alpha,i,b,g,r){network[i][0]-=alpha*(network[i][0]-b)/initalpha;network[i][1]-=alpha*(network[i][1]-g)/initalpha;network[i][2]-=alpha*(network[i][2]-r)/initalpha}function alterneigh(radius,i,b,g,r){var lo=Math.abs(i-radius);var hi=Math.min(i+radius,netsize);var j=i+1;var k=i-1;var m=1;var p,a;while(j<hi||k>lo){a=radpower[m++];if(j<hi){p=network[j++];p[0]-=a*(p[0]-b)/alpharadbias;p[1]-=a*(p[1]-g)/alpharadbias;p[2]-=a*(p[2]-r)/alpharadbias}if(k>lo){p=network[k--];p[0]-=a*(p[0]-b)/alpharadbias;p[1]-=a*(p[1]-g)/alpharadbias;p[2]-=a*(p[2]-r)/alpharadbias}}}function contest(b,g,r){var bestd=~(1<<31);var bestbiasd=bestd;var bestpos=-1;var bestbiaspos=bestpos;var i,n,dist,biasdist,betafreq;for(i=0;i<netsize;i++){n=network[i];dist=Math.abs(n[0]-b)+Math.abs(n[1]-g)+Math.abs(n[2]-r);if(dist<bestd){bestd=dist;bestpos=i}biasdist=dist-(bias[i]>>intbiasshift-netbiasshift);if(biasdist<bestbiasd){bestbiasd=biasdist;bestbiaspos=i}betafreq=freq[i]>>betashift;freq[i]-=betafreq;bias[i]+=betafreq<<gammashift}freq[bestpos]+=beta;bias[bestpos]-=betagamma;return bestbiaspos}function inxbuild(){var i,j,p,q,smallpos,smallval,previouscol=0,startpos=0;for(i=0;i<netsize;i++){p=network[i];smallpos=i;smallval=p[1];for(j=i+1;j<netsize;j++){q=network[j];if(q[1]<smallval){smallpos=j;smallval=q[1]}}q=network[smallpos];if(i!=smallpos){j=q[0];q[0]=p[0];p[0]=j;j=q[1];q[1]=p[1];p[1]=j;j=q[2];q[2]=p[2];p[2]=j;j=q[3];q[3]=p[3];p[3]=j}if(smallval!=previouscol){netindex[previouscol]=startpos+i>>1;for(j=previouscol+1;j<smallval;j++)netindex[j]=i;previouscol=smallval;startpos=i}}netindex[previouscol]=startpos+maxnetpos>>1;for(j=previouscol+1;j<256;j++)netindex[j]=maxnetpos}function inxsearch(b,g,r){var a,p,dist;var bestd=1e3;var best=-1;var i=netindex[g];var j=i-1;while(i<netsize||j>=0){if(i<netsize){p=network[i];dist=p[1]-g;if(dist>=bestd)i=netsize;else{i++;if(dist<0)dist=-dist;a=p[0]-b;if(a<0)a=-a;dist+=a;if(dist<bestd){a=p[2]-r;if(a<0)a=-a;dist+=a;if(dist<bestd){bestd=dist;best=p[3]}}}}if(j>=0){p=network[j];dist=g-p[1];if(dist>=bestd)j=-1;else{j--;if(dist<0)dist=-dist;a=p[0]-b;if(a<0)a=-a;dist+=a;if(dist<bestd){a=p[2]-r;if(a<0)a=-a;dist+=a;if(dist<bestd){bestd=dist;best=p[3]}}}}}return best}function learn(){var i;var lengthcount=pixels.length;var alphadec=30+(samplefac-1)/3;var samplepixels=lengthcount/(3*samplefac);var delta=~~(samplepixels/ncycles);var alpha=initalpha;var radius=initradius;var rad=radius>>radiusbiasshift;if(rad<=1)rad=0;for(i=0;i<rad;i++)radpower[i]=alpha*((rad*rad-i*i)*radbias/(rad*rad));var step;if(lengthcount<minpicturebytes){samplefac=1;step=3}else if(lengthcount%prime1!==0){step=3*prime1}else if(lengthcount%prime2!==0){step=3*prime2}else if(lengthcount%prime3!==0){step=3*prime3}else{step=3*prime4}var b,g,r,j;var pix=0;i=0;while(i<samplepixels){b=(pixels[pix]&255)<<netbiasshift;g=(pixels[pix+1]&255)<<netbiasshift;r=(pixels[pix+2]&255)<<netbiasshift;j=contest(b,g,r);altersingle(alpha,j,b,g,r);if(rad!==0)alterneigh(rad,j,b,g,r);pix+=step;if(pix>=lengthcount)pix-=lengthcount;i++;if(delta===0)delta=1;if(i%delta===0){alpha-=alpha/alphadec;radius-=radius/radiusdec;rad=radius>>radiusbiasshift;if(rad<=1)rad=0;for(j=0;j<rad;j++)radpower[j]=alpha*((rad*rad-j*j)*radbias/(rad*rad))}}}function buildColormap(){init();learn();unbiasnet();inxbuild()}this.buildColormap=buildColormap;function getColormap(){var map=[];var index=[];for(var i=0;i<netsize;i++)index[network[i][3]]=i;var k=0;for(var l=0;l<netsize;l++){var j=index[l];map[k++]=network[j][0];map[k++]=network[j][1];map[k++]=network[j][2]}return map}this.getColormap=getColormap;this.lookupRGB=inxsearch}module.exports=NeuQuant},{}],4:[function(require,module,exports){var GIFEncoder,renderFrame;GIFEncoder=require("./GIFEncoder.js");renderFrame=function(frame){var encoder,page,stream,transfer;encoder=new GIFEncoder(frame.width,frame.height);if(frame.index===0){encoder.writeHeader()}else{encoder.firstFrame=false}encoder.setTransparent(frame.transparent);encoder.setRepeat(frame.repeat);encoder.setDelay(frame.delay);encoder.setQuality(frame.quality);encoder.setDither(frame.dither);encoder.setGlobalPalette(frame.globalPalette);encoder.addFrame(frame.data);if(frame.last){encoder.finish()}if(frame.globalPalette===true){frame.globalPalette=encoder.getGlobalPalette()}stream=encoder.stream();frame.data=stream.pages;frame.cursor=stream.cursor;frame.pageSize=stream.constructor.pageSize;if(frame.canTransfer){transfer=function(){var i,len,ref,results;ref=frame.data;results=[];for(i=0,len=ref.length;i<len;i++){page=ref[i];results.push(page.buffer)}return results}();return self.postMessage(frame,transfer)}else{return self.postMessage(frame)}};self.onmessage=function(event){return renderFrame(event.data)}},{"./GIFEncoder.js":1}]},{},[4]);
`;

    initApp();
});
