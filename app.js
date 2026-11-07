const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a10);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const baseCameraPos = new THREE.Vector3(0, 2, 6);
camera.position.copy(baseCameraPos);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('canvas-container').appendChild(renderer.domElement);

const GLOBAL_SCALE = 15.0;
const ANIM_CONFIG = { hoverOut: 0.12, pullOut: 0.2, liftHeight: 0.2, ejectHover: 0.1, parallaxX: 0.4, parallaxY: 0.3 };

// ==========================================
// 💬 互动文本配置 (环境叙事核心)
// ==========================================
const INTERACT_MSGS = {
    "Microphone": "I record most of my voice on it.",
    "Coffee": "Still warm.",
    "Frame1": "Celeste. The game that taught me about games as an art of failure.",
    "Frame2": "The Witness. The game that showed me how games reflect their creator's charm.",
    "Frame3": "Death Stranding. The game that persuaded 'connection' through mechanics.",
    "Frame4": "NaissanceE. Artistic inspiration. Makes me think of Tsutomu Nihei's works.",
    "Frame": "Loom. Its innovative design shocks me even till today."
};

const BLOOM_CONFIG = { strength: 0.1, radius: 0.2, threshold: 0.3, idleIntensity: 0.05, activeIntensity: 0.05, idleColor: 0x00d2ff, activeColor: 0x000000, glassOpacity: 0.2, screenIntensity: 0.2 };

const LIGHT_CONFIG = {
    main: { ambientColor: 0xa89677, ambientIntensity: 0.5, spotColor: 0xfac878, spotIntensity: 1, posX: 0, posY: 15, posZ: 8 },
    viewer: { ambientIntensity: 0.3, dirIntensity: 1.5, posX: 5, posY: 10, posZ: 5, fillIntensity: 0.4, fillPosX: -3, fillPosY: 2, fillPosZ: 5 },
    sun: { color: 0xffa95c, intensity: 4, posX: -4, posY: 15, posZ: -20 }
};

const ambientLight = new THREE.AmbientLight(LIGHT_CONFIG.main.ambientColor, LIGHT_CONFIG.main.ambientIntensity);
scene.add(ambientLight);

const topLight = new THREE.SpotLight(LIGHT_CONFIG.main.spotColor, LIGHT_CONFIG.main.spotIntensity);
topLight.position.set(LIGHT_CONFIG.main.posX, LIGHT_CONFIG.main.posY, LIGHT_CONFIG.main.posZ);
topLight.angle = Math.PI / 4; topLight.penumbra = 0.8; topLight.decay = 2.0; topLight.distance = 60;
topLight.castShadow = true; topLight.shadow.bias = -0.001; topLight.shadow.mapSize.width = 2048; topLight.shadow.mapSize.height = 2048;
scene.add(topLight);

const sunLight = new THREE.SpotLight(LIGHT_CONFIG.sun.color, LIGHT_CONFIG.sun.intensity);
sunLight.position.set(LIGHT_CONFIG.sun.posX, LIGHT_CONFIG.sun.posY, LIGHT_CONFIG.sun.posZ);
sunLight.target.position.set(0, 0, 0); scene.add(sunLight.target);
sunLight.angle = Math.PI / 8; sunLight.penumbra = 0.2; sunLight.decay = 2.0; sunLight.distance = 200;
sunLight.castShadow = true; sunLight.shadow.bias = -0.0005; sunLight.shadow.mapSize.width = 2048; sunLight.shadow.mapSize.height = 2048;
scene.add(sunLight);

const renderScene = new THREE.RenderPass(scene, camera);
const bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), BLOOM_CONFIG.strength, BLOOM_CONFIG.radius, BLOOM_CONFIG.threshold);
const composer = new THREE.EffectComposer(renderer);
composer.addPass(renderScene); composer.addPass(bloomPass);

// 核心互动数据结构
const cartridges = [];
const interactTriggers = [];
const wallFrames = [];
let framesHidden = true;

let activeCartridge = null, hoveredCartridge = null, hoveredInteractObj = null;
let triggerObject = null, aboutTrigger = null;
let previewModelsList = [], currentModelIndex = 0;
let tvScreenMat = null, glassMat = null;
const SLOT_POS = new THREE.Vector3(), SLOT_ROT = new THREE.Euler();
const shelfLocations = new Array(12);

const tvVideo = document.createElement('video');
tvVideo.loop = true; tvVideo.muted = true; tvVideo.playsInline = true; tvVideo.crossOrigin = "anonymous";
const tvVideoTexture = new THREE.VideoTexture(tvVideo);
tvVideoTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
const textureLoader = new THREE.TextureLoader();
let slideshowInterval = null, toastTimeout = null;

function fitMediaToScreen(texture) {
    texture.flipY = false;
    if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace; else texture.encoding = 3001;
    texture.matrixAutoUpdate = true; texture.center.set(0.5, 0.5); texture.rotation = Math.PI / 2; texture.repeat.set(1, 1);
}

function addBreathingGlow(obj, maxIntensity = 0.25) {
    obj.traverse(child => {
        if (child.isMesh && child.material && !child.name.includes('Hitbox')) {
            child.material = child.material.clone();
            child.material.emissive = new THREE.Color(0x287574);
            child.material.emissiveIntensity = 0;
            gsap.to(child.material, { emissiveIntensity: maxIntensity, duration: 1.5 + Math.random() * 0.5, yoyo: true, repeat: -1, ease: "sine.inOut" });
        }
    });
}

function showToast(message) {
    const toast = document.getElementById('message-toast');
    toast.innerText = message;
    toast.classList.add('show');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { toast.classList.remove('show'); }, 1500);
}

// ==========================================
// 📺 独立出来的媒体激活函数 (用于初始化和切换)
// ==========================================
function activateCartridgeMedia(cart) {
    if (!cart) return;
    if (tvScreenMat) {
        const mediaData = cart.userData;
        tvScreenMat.color.setHex(0xffffff);
        if (glassMat) { glassMat.emissive.setHex(BLOOM_CONFIG.activeColor); glassMat.emissiveIntensity = BLOOM_CONFIG.activeIntensity; }

        if (mediaData.screenMedia) {
            const mediaList = Array.isArray(mediaData.screenMedia) ? mediaData.screenMedia : [mediaData.screenMedia];
            if (mediaList.length === 1 && mediaList[0].match(/\.(mp4|webm)$/i)) {
                tvVideo.src = mediaList[0]; tvVideo.play();
                tvVideo.onloadedmetadata = () => { fitMediaToScreen(tvVideoTexture); tvScreenMat.map = tvVideoTexture; tvScreenMat.emissive = new THREE.Color(0xffffff); tvScreenMat.emissiveMap = tvVideoTexture; tvScreenMat.emissiveIntensity = BLOOM_CONFIG.screenIntensity; tvScreenMat.needsUpdate = true; };
            } else {
                let currentIndex = 0;
                const loadAndShowImage = (url) => { textureLoader.load(url, (tex) => { fitMediaToScreen(tex); tvScreenMat.map = tex; tvScreenMat.emissive = new THREE.Color(0xffffff); tvScreenMat.emissiveMap = tex; tvScreenMat.emissiveIntensity = BLOOM_CONFIG.screenIntensity; tvScreenMat.needsUpdate = true; }); };
                loadAndShowImage(mediaList[0]);
                if (mediaList.length > 1) { slideshowInterval = setInterval(() => { currentIndex = (currentIndex + 1) % mediaList.length; loadAndShowImage(mediaList[currentIndex]); }, 3000); }
            }
        } else {
            tvScreenMat.map = null; tvScreenMat.emissiveMap = null; tvScreenMat.color.setHex(BLOOM_CONFIG.activeColor); tvScreenMat.emissive.setHex(BLOOM_CONFIG.activeColor); tvScreenMat.emissiveIntensity = BLOOM_CONFIG.screenIntensity;
        }
        tvScreenMat.needsUpdate = true;
    }
    updateUI(cart.userData);
}

// ⏳ 获取加载界面的 DOM 元素
const loadingScreen = document.getElementById('loading-screen');
const loadingPercent = document.getElementById('loading-percent');
const progressBar = document.getElementById('progress-bar');
const loadingTitle = document.getElementById('loading-title');

async function initApp() {
    try {
        let projectsData = [];
        try { projectsData = await (await fetch('data.json')).json(); } catch (e) {}
        try { previewModelsList = await (await fetch('preview_models.json')).json(); } catch (e) {}

        // 配置 DRACO 解压器
        const dracoLoader = new THREE.DRACOLoader();
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
        const loader = new THREE.GLTFLoader();
        loader.setDRACOLoader(dracoLoader);

        const loadWithProgress = (url, isMain = false) => loader.loadAsync(url, (xhr) => {
            if (isMain && xhr.total > 0) {
                const percent = Math.round((xhr.loaded / xhr.total) * 100);
                loadingPercent.innerText = `${percent}%`;
                progressBar.style.width = `${percent}%`;
                if (percent === 100) { loadingTitle.innerText = "MOUNTING ENVIRONMENT..."; }
                else { loadingTitle.innerText = "DOWNLOADING ASSETS..."; }
            }
        });

        const [mainSceneGltf, cartGltf] = await Promise.all([
            loadWithProgress('models/main_scene.glb', true),
            loader.loadAsync('models/cartridge.glb')
        ]);

        const mainScene = mainSceneGltf.scene;
        mainScene.scale.set(GLOBAL_SCALE, GLOBAL_SCALE, GLOBAL_SCALE);
        mainScene.updateMatrixWorld(true);
        scene.add(mainScene);

        mainScene.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true; child.receiveShadow = true;
                if (child.material) child.material.shadowSide = THREE.DoubleSide;
            }

            if (child.name === 'Models' && child.isMesh) {
                triggerObject = child; child.userData.baseScale = child.scale.clone();
                addBreathingGlow(child, 0.4);
            }

            if (child.name.includes('AboutMe') && aboutTrigger === null) {
                aboutTrigger = child; child.userData.baseScale = child.scale.clone();
                addBreathingGlow(child, 0.3);
                const box = new THREE.Box3().setFromObject(child);
                const size = new THREE.Vector3(); box.getSize(size);
                const hitBoxGeo = new THREE.BoxGeometry(Math.max(size.x * 1.2, 0.5), Math.max(size.y * 1.2, 0.5), Math.max(size.z * 1.5, 0.5));
                const hitBoxMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, color: 0xff0000, depthWrite: false });
                const hitBoxMesh = new THREE.Mesh(hitBoxGeo, hitBoxMat); hitBoxMesh.name = "AboutMe_Hitbox";
                const center = new THREE.Vector3(); box.getCenter(center); child.worldToLocal(center); hitBoxMesh.position.copy(center);
                child.add(hitBoxMesh);
            }

            if (child.isMesh) {
                const meshName = child.name;
                const parentName = child.parent ? child.parent.name : "";
                const sortedKeys = Object.keys(INTERACT_MSGS).sort((a, b) => b.length - a.length);

                for (let key of sortedKeys) {
                    const matchPattern = (name, k) => name === k || name.startsWith(k + '.') || name.startsWith(k + '_');
                    if (matchPattern(meshName, key) || matchPattern(parentName, key)) {
                        let interactRoot = matchPattern(parentName, key) ? child.parent : child;
                        if (!interactRoot.userData.message) {
                            interactRoot.userData.message = INTERACT_MSGS[key];
                            interactRoot.userData.baseScale = interactRoot.scale.clone();
                            interactTriggers.push(interactRoot);
                        }
                        child.userData.parentInteract = interactRoot;
                        break;
                    }
                }
            }

            // 💡 隐藏所有画框
            if (child.isMesh && (child.name.startsWith('Frame') || (child.parent && child.parent.name.startsWith('Frame')))) {
                let frameRoot = child.parent && child.parent.name.startsWith('Frame') ? child.parent : child;
                if (!frameRoot.userData.isSetupFrame) {
                    frameRoot.userData.isSetupFrame = true;
                    frameRoot.userData.initialPosY = frameRoot.position.y;
                    frameRoot.position.y += 15;
                    wallFrames.push(frameRoot);
                }
            }

            if (child.name === 'WindowGlass' && child.isMesh) {
                child.castShadow = false; child.material = child.material.clone(); child.material.transparent = true; child.material.opacity = 0.1;
                child.material.depthWrite = false; child.material.roughness = 0.1; child.material.metalness = 0.1;
            }

            if (child.name === 'Glass' && child.isMesh) {
                child.material = child.material.clone(); glassMat = child.material; glassMat.transparent = true;
                glassMat.opacity = BLOOM_CONFIG.glassOpacity; glassMat.emissive = new THREE.Color(BLOOM_CONFIG.idleColor); glassMat.emissiveIntensity = BLOOM_CONFIG.idleIntensity;
            }

            if (child.name === 'Screen' && child.isMesh) {
                tvScreenMat = child.material; tvScreenMat.color.setHex(0xffffff); tvScreenMat.map = null; tvScreenMat.color.setHex(0x000000);
                const uvAttribute = child.geometry.attributes.uv;
                if (uvAttribute) {
                    let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
                    for (let i = 0; i < uvAttribute.count; i++) {
                        minU = Math.min(minU, uvAttribute.getX(i)); maxU = Math.max(maxU, uvAttribute.getX(i));
                        minV = Math.min(minV, uvAttribute.getY(i)); maxV = Math.max(maxV, uvAttribute.getY(i));
                    }
                    const rangeU = maxU - minU; const rangeV = maxV - minV;
                    for (let i = 0; i < uvAttribute.count; i++) {
                        uvAttribute.setXY(i, rangeU > 0 ? (uvAttribute.getX(i) - minU) / rangeU : 0.5, rangeV > 0 ? (uvAttribute.getY(i) - minV) / rangeV : 0.5);
                    }
                    uvAttribute.needsUpdate = true;
                }
            }

            if (child.name === 'card_loc') {
                child.getWorldPosition(SLOT_POS); const quat = new THREE.Quaternion();
                child.getWorldQuaternion(quat); SLOT_ROT.setFromQuaternion(quat);
            }
            const num = parseInt(child.name);
            if (!isNaN(num) && num >= 1 && num <= 12) {
                const pos = new THREE.Vector3(); const quat = new THREE.Quaternion();
                child.getWorldPosition(pos); child.getWorldQuaternion(quat);
                shelfLocations[num - 1] = { pos: pos, rot: new THREE.Euler().setFromQuaternion(quat) };
            }
        });

        const cartPrefab = cartGltf.scene;
        cartPrefab.scale.set(GLOBAL_SCALE, GLOBAL_SCALE, GLOBAL_SCALE);

        projectsData.forEach((data, index) => {
            if (index >= 12 || !shelfLocations[index]) return;
            const cartClone = cartPrefab.clone(); const locationInfo = shelfLocations[index];

            cartClone.rotation.copy(locationInfo.rot); cartClone.rotateY(Math.PI / 2);
            cartClone.userData = { ...data, initialRotation: cartClone.rotation.clone(), initialPosition: locationInfo.pos.clone(), shelfOriginalRot: locationInfo.rot.clone() };

            cartClone.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true; child.receiveShadow = true; child.userData.parentCart = cartClone;

                    if (child.material && child.material.name.includes('Color') && data.color) {
                        child.material = child.material.clone();
                        const hexColor = parseInt(data.color, 16);
                        child.material.color.setHex(hexColor);
                        child.material.emissive.setHex(hexColor);
                        gsap.to(child.material, { emissiveIntensity: 1.8, duration: 0.8 + Math.random() * 0.6, yoyo: true, repeat: -1, ease: "sine.inOut" });
                    }
                }
            });

            // 🌟 让所有卡带一开始都老老实实呆在架子上
            cartClone.position.copy(locationInfo.pos);

            scene.add(cartClone); cartridges.push(cartClone);
        });

        // 淡出加载界面
        loadingTitle.innerText = "SYSTEM READY";
        setTimeout(() => {
            loadingScreen.style.opacity = '0';
            loadingScreen.style.visibility = 'hidden';
            setTimeout(() => {
                if (cartridges.length > 0) {
                    const welcomeCart = cartridges[cartridges.length - 1];
                    loadCartridge(welcomeCart);
                }
            }, 500);
        }, 600);

    } catch (error) {
        loadingTitle.innerText = "ERROR LOADING ASSETS";
        loadingTitle.style.color = "#ff4444";
        console.error("模型加载发生错误:", error);
    }
}
initApp();

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(0, 0);
const tooltip = document.getElementById('hover-tooltip');

window.addEventListener('mousemove', (event) => {
    if (document.getElementById('game-modal').style.display === 'flex') return;
    if (document.getElementById('model-modal').style.display === 'flex') return;
    if (document.getElementById('about-modal').style.display === 'flex') return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const isHoveringTrigger = triggerObject && raycaster.intersectObject(triggerObject, true).length > 0;
    if (triggerObject && triggerObject.userData.isHovered !== isHoveringTrigger) {
        triggerObject.userData.isHovered = isHoveringTrigger;
        const scaleMult = isHoveringTrigger ? 1.05 : 1.0;
        gsap.to(triggerObject.scale, { x: triggerObject.userData.baseScale.x * scaleMult, y: triggerObject.userData.baseScale.y * scaleMult, z: triggerObject.userData.baseScale.z * scaleMult, duration: 0.2, overwrite: "auto" });
    }

    const isHoveringAbout = aboutTrigger && raycaster.intersectObject(aboutTrigger, true).length > 0;
    if (aboutTrigger && aboutTrigger.userData.isHovered !== isHoveringAbout) {
        aboutTrigger.userData.isHovered = isHoveringAbout;
        const scaleMult = isHoveringAbout ? 1.05 : 1.0;
        gsap.to(aboutTrigger.scale, { x: aboutTrigger.userData.baseScale.x * scaleMult, y: aboutTrigger.userData.baseScale.y * scaleMult, z: aboutTrigger.userData.baseScale.z * scaleMult, duration: 0.2, overwrite: "auto" });
    }

    const interactIntersects = raycaster.intersectObjects(interactTriggers, true);
    const hitInteract = interactIntersects.find(hit => hit.object.userData && hit.object.userData.parentInteract)?.object.userData.parentInteract;

    if (hoveredInteractObj !== hitInteract) {
        if (hoveredInteractObj) {
            gsap.to(hoveredInteractObj.scale, { x: hoveredInteractObj.userData.baseScale.x, y: hoveredInteractObj.userData.baseScale.y, z: hoveredInteractObj.userData.baseScale.z, duration: 0.2, overwrite: "auto" });
        }
        if (hitInteract) {
            gsap.to(hitInteract.scale, { x: hitInteract.userData.baseScale.x * 1.05, y: hitInteract.userData.baseScale.y * 1.05, z: hitInteract.userData.baseScale.z * 1.05, duration: 0.2, overwrite: "auto" });
        }
        hoveredInteractObj = hitInteract;
    }

    if (isHoveringTrigger) {
        document.body.style.cursor = 'zoom-in'; tooltip.innerText = "View 3D Gallery"; tooltip.style.opacity = 1;
        tooltip.style.left = event.clientX + 15 + 'px'; tooltip.style.top = event.clientY + 15 + 'px';
    } else if (isHoveringAbout) {
        document.body.style.cursor = 'pointer'; tooltip.innerText = "About Me"; tooltip.style.opacity = 1;
        tooltip.style.left = event.clientX + 15 + 'px'; tooltip.style.top = event.clientY + 15 + 'px';
    } else if (hitInteract) {
        document.body.style.cursor = 'pointer'; tooltip.innerText = "Inspect"; tooltip.style.opacity = 1;
        tooltip.style.left = event.clientX + 15 + 'px'; tooltip.style.top = event.clientY + 15 + 'px';
    } else {
        const hitCart = raycaster.intersectObjects(cartridges, true).find(hit => hit.object.userData && hit.object.userData.parentCart)?.object.userData.parentCart;
        if (hitCart && hitCart !== activeCartridge) {
            if (hoveredCartridge !== hitCart) {
                if (hoveredCartridge && hoveredCartridge !== activeCartridge) {
                    gsap.to(hoveredCartridge.position, { x: hoveredCartridge.userData.initialPosition.x, y: hoveredCartridge.userData.initialPosition.y, z: hoveredCartridge.userData.initialPosition.z, duration: 0.2 });
                }
                hoveredCartridge = hitCart;
                const slideOutPos = hoveredCartridge.userData.initialPosition.clone();
                const outDir = new THREE.Vector3(0, 0, 1).applyEuler(hoveredCartridge.userData.shelfOriginalRot).normalize();
                slideOutPos.add(outDir.multiplyScalar(ANIM_CONFIG.hoverOut * GLOBAL_SCALE));
                gsap.to(hoveredCartridge.position, { x: slideOutPos.x, y: slideOutPos.y, z: slideOutPos.z, duration: 0.2 });
                tooltip.innerText = hoveredCartridge.userData.name; tooltip.style.opacity = 1;
            }
            tooltip.style.left = event.clientX + 15 + 'px'; tooltip.style.top = event.clientY + 15 + 'px';
            document.body.style.cursor = 'pointer';
        } else {
            if (hoveredCartridge && hoveredCartridge !== activeCartridge) {
                gsap.to(hoveredCartridge.position, { x: hoveredCartridge.userData.initialPosition.x, y: hoveredCartridge.userData.initialPosition.y, z: hoveredCartridge.userData.initialPosition.z, duration: 0.2 });
                hoveredCartridge = null;
            }
            tooltip.style.opacity = 0; document.body.style.cursor = 'default';
        }
    }

    if ((isHoveringTrigger || isHoveringAbout || hitInteract) && hoveredCartridge && hoveredCartridge !== activeCartridge) {
        gsap.to(hoveredCartridge.position, { x: hoveredCartridge.userData.initialPosition.x, y: hoveredCartridge.userData.initialPosition.y, z: hoveredCartridge.userData.initialPosition.z, duration: 0.2 });
        hoveredCartridge = null;
    }
});

window.addEventListener('click', (event) => {
    if (document.getElementById('game-modal').style.display === 'flex') return;
    if (document.getElementById('model-modal').style.display === 'flex') return;
    if (document.getElementById('about-modal').style.display === 'flex') return;

    raycaster.setFromCamera(mouse, camera);

    if (triggerObject && raycaster.intersectObject(triggerObject, true).length > 0) {
        tooltip.style.opacity = 0; document.body.style.cursor = 'default'; openModelViewer(); return;
    }

    if (aboutTrigger && raycaster.intersectObject(aboutTrigger, true).length > 0) {
        tooltip.style.opacity = 0; document.body.style.cursor = 'default'; openAboutModal(); return;
    }

    // 💡 处理文字彩蛋点击 (加入画框飞跃展示逻辑)
    // 💡 处理文字彩蛋点击 (完美版：画框飞跃展示逻辑)
    const interactIntersects = raycaster.intersectObjects(interactTriggers, true);
    const hitInteract = interactIntersects.find(hit => hit.object.userData && hit.object.userData.parentInteract)?.object.userData.parentInteract;

    if (hitInteract) {
        if (hitInteract.userData.isAnimating) return; // 防抖锁

        showToast(hitInteract.userData.message);

        if (hitInteract.name.startsWith('Frame')) {
            hitInteract.userData.isAnimating = true;

            // 1. 记录它当前的位置和四元数旋转
            const originalPos = hitInteract.position.clone();
            const originalQuat = hitInteract.quaternion.clone();

            // 2. 计算摄像机前方 4 个单位的世界坐标，并转换为画框的局部坐标（抵消 15 倍缩放）
            const offset = new THREE.Vector3(0, -0.3, -4);
            const targetWorldPos = offset.applyMatrix4(camera.matrixWorld);
            const targetLocalPos = hitInteract.parent.worldToLocal(targetWorldPos.clone());

            // 3. 算出完美面对摄像机的局部旋转角度
            const dummy = new THREE.Object3D();
            hitInteract.parent.add(dummy);
            dummy.position.copy(targetLocalPos);
            dummy.lookAt(camera.position);
            dummy.rotateZ(-Math.PI / 2);
            const targetLocalQuat = dummy.quaternion.clone();
            hitInteract.parent.remove(dummy);

            // 🎬 阶段 A：飞到镜头前
            gsap.to(hitInteract.position, {
                x: targetLocalPos.x,
                y: targetLocalPos.y,
                z: targetLocalPos.z,
                duration: 0.5,
                ease: "power2.out"
            });

            const proxyRot = { t: 0 };
            gsap.to(proxyRot, {
                t: 1,
                duration: 0.2,
                ease: "power2.out",
                onUpdate: () => {
                    // 使用球面线性插值，杜绝乱翻滚
                    hitInteract.quaternion.slerpQuaternions(originalQuat, targetLocalQuat, proxyRot.t);
                },
                onComplete: () => {
                    const displayTime = 1.5; // 👈 停留 2 秒

                    // 🎬 阶段 B：飞回原处
                    gsap.to(hitInteract.position, {
                        x: originalPos.x,
                        y: originalPos.y,
                        z: originalPos.z,
                        duration: 0.8,
                        delay: displayTime,
                        ease: "power2.inOut"
                    });

                    const returnProxyRot = { t: 0 };
                    gsap.to(returnProxyRot, {
                        t: 1,
                        duration: 0.8,
                        delay: displayTime,
                        ease: "power2.inOut",
                        onUpdate: () => {
                            hitInteract.quaternion.slerpQuaternions(targetLocalQuat, originalQuat, returnProxyRot.t);
                        },
                        onComplete: () => {
                            hitInteract.userData.isAnimating = false; // 解锁
                        }
                    });
                }
            });
        }
        return;
    }

    const hitCart = raycaster.intersectObjects(cartridges, true).find(hit => hit.object.userData && hit.object.userData.parentCart)?.object.userData.parentCart;
    if (hitCart && activeCartridge !== hitCart) {
        tooltip.style.opacity = 0; hoveredCartridge = null; document.body.style.cursor = 'default'; loadCartridge(hitCart);
    }
});

function loadCartridge(newCartridge) {
    if (activeCartridge) ejectCartridge(false);
    activeCartridge = newCartridge;

    const liftHeight = SLOT_POS.y + (ANIM_CONFIG.liftHeight * GLOBAL_SCALE);
    const pullOutPos = newCartridge.userData.initialPosition.clone();
    const outDir = new THREE.Vector3(0, 0, 1).applyEuler(newCartridge.userData.shelfOriginalRot).normalize();
    pullOutPos.add(outDir.multiplyScalar(ANIM_CONFIG.pullOut * GLOBAL_SCALE));

    const tl = gsap.timeline();
    tl.to(newCartridge.position, { x: pullOutPos.x, y: pullOutPos.y, z: pullOutPos.z, duration: 0.25 })
      .to(newCartridge.position, { y: liftHeight, duration: 0.25 })
      .to(newCartridge.position, { x: SLOT_POS.x, z: SLOT_POS.z, duration: 0.4 })
      .to(newCartridge.rotation, { x: SLOT_ROT.x, y: SLOT_ROT.y, z: SLOT_ROT.z, duration: 0.4 }, "<")
      .to(newCartridge.position, { y: SLOT_POS.y, duration: 0.2, onComplete: () => {
          activateCartridgeMedia(newCartridge);
      }});
}

window.ejectCartridge = function(clearUI = true) {
    if (!activeCartridge) return;
    const cart = activeCartridge; activeCartridge = null;
    if (slideshowInterval) { clearInterval(slideshowInterval); slideshowInterval = null; }
    if (tvScreenMat) { tvVideo.pause(); tvVideo.src = ""; tvScreenMat.map = null; tvScreenMat.emissiveMap = null; tvScreenMat.color.setHex(0x000000); tvScreenMat.emissive.setHex(0x000000); tvScreenMat.needsUpdate = true; }
    if (glassMat) { glassMat.emissive.setHex(BLOOM_CONFIG.idleColor); glassMat.emissiveIntensity = BLOOM_CONFIG.idleIntensity; }
    if (clearUI) document.getElementById('ui-panel').classList.remove('active');

    // 弹回自己真正的架子位置
    const pullOutPos = cart.userData.initialPosition.clone();
    const outDir = new THREE.Vector3(0, 0, 1).applyEuler(cart.userData.shelfOriginalRot).normalize();
    pullOutPos.add(outDir.multiplyScalar(ANIM_CONFIG.pullOut * GLOBAL_SCALE));
    const tl = gsap.timeline();
    tl.to(cart.position, { y: SLOT_POS.y + (ANIM_CONFIG.liftHeight * GLOBAL_SCALE), duration: 0.2 })
      .to(cart.position, { x: pullOutPos.x, y: pullOutPos.y + (ANIM_CONFIG.ejectHover * GLOBAL_SCALE), z: pullOutPos.z, duration: 0.4 })
      .to(cart.rotation, { x: cart.userData.initialRotation.x, y: cart.userData.initialRotation.y, z: cart.userData.initialRotation.z, duration: 0.4 }, "<")
      .to(cart.position, { y: pullOutPos.y, duration: 0.15 })
      .to(cart.position, { x: cart.userData.initialPosition.x, z: cart.userData.initialPosition.z, duration: 0.25 });
};

function updateUI(data) {
    const ui = document.getElementById('ui-panel');
    document.getElementById('project-title').innerText = data.name;
    document.getElementById('project-desc').innerText = data.desc;
    document.getElementById('project-tags').innerText = data.tags;

    const playBtn = document.getElementById('play-btn');
    if (data.hasGame && data.gameUrl) { playBtn.style.display = 'block'; playBtn.onclick = playGame; } else { playBtn.style.display = 'none'; }

    const itchBtn = document.getElementById('itch-btn');
    let itchUrl = data.itchLink;
    if (!itchUrl && data.link && data.link.includes('itch.io')) itchUrl = data.link;
    if (itchUrl) { itchBtn.style.display = 'block'; itchBtn.onclick = () => window.open(itchUrl, '_blank'); } else { itchBtn.style.display = 'none'; }

    const linkBtn = document.getElementById('link-btn');
    if (data.link && data.link.trim() !== "" && data.link !== itchUrl) { linkBtn.style.display = 'block'; linkBtn.onclick = () => window.open(data.link, '_blank'); } else { linkBtn.style.display = 'none'; }

    document.getElementById('eject-btn').style.display = 'block';
    ui.classList.add('active');
}

window.playGame = function() {
    if (activeCartridge && activeCartridge.userData.gameUrl) { document.getElementById('game-iframe').src = activeCartridge.userData.gameUrl; document.getElementById('game-modal').style.display = 'flex'; }
};
window.closeGame = function(event) {
    if (event) event.stopPropagation(); document.getElementById('game-modal').style.display = 'none'; document.getElementById('game-iframe').src = "";
};
window.openAboutModal = function() { document.getElementById('about-modal').style.display = 'flex'; };
window.closeAbout = function(event) { if (event) event.stopPropagation(); document.getElementById('about-modal').style.display = 'none'; };

let viewerScene, viewerCamera, viewerRenderer, viewerControls;
let viewerInitialized = false, viewerAnimationId = null, modelGroup = new THREE.Group();

function initModelViewer() {
    const container = document.getElementById('viewer-canvas-container'); container.innerHTML = '';
    viewerScene = new THREE.Scene();
    viewerScene.add(new THREE.AmbientLight(0xffffff, LIGHT_CONFIG.viewer.ambientIntensity));
    const dirLight = new THREE.DirectionalLight(0xffffff, LIGHT_CONFIG.viewer.dirIntensity); dirLight.position.set(LIGHT_CONFIG.viewer.posX, LIGHT_CONFIG.viewer.posY, LIGHT_CONFIG.viewer.posZ); viewerScene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, LIGHT_CONFIG.viewer.fillIntensity); fillLight.position.set(LIGHT_CONFIG.viewer.fillPosX, LIGHT_CONFIG.viewer.fillPosY, LIGHT_CONFIG.viewer.fillPosZ); viewerScene.add(fillLight);
    viewerCamera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100); viewerCamera.position.set(0, 0, 5);
    viewerRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); viewerRenderer.setSize(container.clientWidth, container.clientHeight); viewerRenderer.setPixelRatio(window.devicePixelRatio);
    viewerRenderer.outputEncoding = THREE.sRGBEncoding; viewerRenderer.toneMapping = THREE.ACESFilmicToneMapping; viewerRenderer.toneMappingExposure = 1.0; container.appendChild(viewerRenderer.domElement);
    if (THREE.OrbitControls) { viewerControls = new THREE.OrbitControls(viewerCamera, viewerRenderer.domElement); viewerControls.enableDamping = true; viewerControls.dampingFactor = 0.05; }
    viewerScene.add(modelGroup); viewerInitialized = true;
}

function loadPreviewModel(modelDataObj) {
    if (!viewerInitialized) initModelViewer();
    while(modelGroup.children.length > 0) modelGroup.remove(modelGroup.children[0]);
    const modelUrl = modelDataObj.url;
    document.getElementById('gallery-title').innerText = modelDataObj.title || "Unknown File"; document.getElementById('gallery-desc').innerText = modelDataObj.desc || "";

    const dracoLoader = new THREE.DRACOLoader();
    dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
    const loader = new THREE.GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    const hintEl = document.querySelector('.viewer-hint'); hintEl.innerText = `Loading Model ${currentModelIndex + 1}/${previewModelsList.length}...`;
    loader.load(modelUrl, (gltf) => {
        const model = gltf.scene; const box = new THREE.Box3().setFromObject(model); const center = box.getCenter(new THREE.Vector3()); const size = box.getSize(new THREE.Vector3()); const maxDim = Math.max(size.x, size.y, size.z);
        model.position.set(-center.x, -center.y, -center.z); const wrapper = new THREE.Group(); wrapper.add(model); wrapper.scale.setScalar(maxDim > 0 ? 3.5 / maxDim : 1);
        modelGroup.add(wrapper); hintEl.innerText = `Model ${currentModelIndex + 1} of ${previewModelsList.length} | Drag to Rotate | Scroll to Zoom`;
    }, undefined, (error) => { console.error(error); hintEl.innerText = `加载失败! 无法读取文件: ${modelUrl}`; });
}

window.openModelViewer = function() { if (previewModelsList.length === 0) { alert("画廊是空的！"); return; } document.getElementById('model-modal').style.display = 'flex'; currentModelIndex = 0; loadPreviewModel(previewModelsList[currentModelIndex]); if (!viewerAnimationId) animateViewer(); };
window.closeModelViewer = function(event) { if (event) event.stopPropagation(); document.getElementById('model-modal').style.display = 'none'; if (viewerAnimationId) { cancelAnimationFrame(viewerAnimationId); viewerAnimationId = null; } };
window.prevModel = function(event) { if (event) event.stopPropagation(); if (previewModelsList.length <= 1) return; currentModelIndex = (currentModelIndex - 1 + previewModelsList.length) % previewModelsList.length; loadPreviewModel(previewModelsList[currentModelIndex]); };
window.nextModel = function(event) { if (event) event.stopPropagation(); if (previewModelsList.length <= 1) return; currentModelIndex = (currentModelIndex + 1) % previewModelsList.length; loadPreviewModel(previewModelsList[currentModelIndex]); };

function animateViewer() { viewerAnimationId = requestAnimationFrame(animateViewer); if (viewerControls) viewerControls.update(); viewerRenderer.render(viewerScene, viewerCamera); }

function animate() {
    requestAnimationFrame(animate);
    const targetX = baseCameraPos.x + (mouse.x * ANIM_CONFIG.parallaxX);
    const targetY = baseCameraPos.y + (mouse.y * ANIM_CONFIG.parallaxY);
    camera.position.x += (targetX - camera.position.x) * 0.05; camera.position.y += (targetY - camera.position.y) * 0.05;
    camera.lookAt(0, 0.1 * GLOBAL_SCALE, 0); composer.render();
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight);
    if (viewerInitialized) { const container = document.getElementById('viewer-canvas-container'); viewerCamera.aspect = container.clientWidth / container.clientHeight; viewerCamera.updateProjectionMatrix(); viewerRenderer.setSize(container.clientWidth, container.clientHeight); }
});

const toggleFramesBtn = document.getElementById('toggle-frames-btn');
if (toggleFramesBtn) {
    toggleFramesBtn.addEventListener('click', () => {
        if (framesHidden) {
            // 画框平滑掉落，带有高级阻尼微弹感
            wallFrames.forEach((frame, idx) => {
                gsap.to(frame.position, {
                    y: frame.userData.initialPosY,
                    duration: 0.6,
                    ease: "back.out(0.2)",
                    delay: idx * 0.1,
                    overwrite: "auto"
                });
            });
            framesHidden = false;
            toggleFramesBtn.innerText = "Works That Influenced Me";
        } else {
            // 画框平滑收回天花板
            wallFrames.forEach((frame, idx) => {
                gsap.to(frame.position, {
                    y: frame.userData.initialPosY + 15,
                    duration: 0.8,
                    ease: "power2.inOut",
                    delay: idx * 0.05,
                    overwrite: "auto"
                });
            });
            framesHidden = true;
            toggleFramesBtn.innerText = "Works That Influenced Me";
        }
    });
}