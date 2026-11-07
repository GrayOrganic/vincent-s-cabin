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
const ANIM_CONFIG = { hoverOut: 0.05, pullOut: 0.2, liftHeight: 0.2, ejectHover: 0.1, parallaxX: 0.4, parallaxY: 0.3 };


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

const cartridges = [];
const interactTriggers = [];
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
    toastTimeout = setTimeout(() => { toast.classList.remove('show'); }, 4000);
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

        // 🆕 配置 DRACO 解压器 (主场景)
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

            // 💡 扫描我们定义的叙事物体 (去除发光，整体绑定)
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
            cartClone.position.copy(locationInfo.pos); cartClone.rotation.copy(locationInfo.rot); cartClone.rotateY(Math.PI / 2);
            cartClone.userData = { ...data, initialRotation: cartClone.rotation.clone(), initialPosition: locationInfo.pos.clone(), shelfOriginalRot: locationInfo.rot.clone() };

            cartClone.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true; child.receiveShadow = true; child.userData.parentCart = cartClone;
                    if (child.material && child.material.name.includes('Color') && data.color) {
                        child.material = child.material.clone(); child.material.color.setHex(parseInt(data.color, 16));
                    }
                }
            });
            addBreathingGlow(cartClone, 0.15);
            scene.add(cartClone); cartridges.push(cartClone);
        });

        // 🌟 一切就绪，淡出加载界面
        loadingTitle.innerText = "SYSTEM READY";
        setTimeout(() => {
            loadingScreen.style.opacity = '0';
            loadingScreen.style.visibility = 'hidden';
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
    if (triggerObject) {
        const scaleMult = isHoveringTrigger ? 1.05 : 1.0;
        gsap.to(triggerObject.scale, { x: triggerObject.userData.baseScale.x * scaleMult, y: triggerObject.userData.baseScale.y * scaleMult, z: triggerObject.userData.baseScale.z * scaleMult, duration: 0.2 });
    }

    const isHoveringAbout = aboutTrigger && raycaster.intersectObject(aboutTrigger, true).length > 0;
    if (aboutTrigger) {
        const scaleMult = isHoveringAbout ? 1.05 : 1.0;
        gsap.to(aboutTrigger.scale, { x: aboutTrigger.userData.baseScale.x * scaleMult, y: aboutTrigger.userData.baseScale.y * scaleMult, z: aboutTrigger.userData.baseScale.z * scaleMult, duration: 0.2 });
    }

    // 互动文字物体 (整体放大)
    const interactIntersects = raycaster.intersectObjects(interactTriggers, true);
    const hitInteract = interactIntersects.find(hit => hit.object.userData && hit.object.userData.parentInteract)?.object.userData.parentInteract;

    interactTriggers.forEach(obj => {
        const isThisHit = (hitInteract === obj);
        const scaleMult = isThisHit ? 1.05 : 1.0;
        gsap.to(obj.scale, { x: obj.userData.baseScale.x * scaleMult, y: obj.userData.baseScale.y * scaleMult, z: obj.userData.baseScale.z * scaleMult, duration: 0.2 });
    });

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

    const interactIntersects = raycaster.intersectObjects(interactTriggers, true);
    const hitInteract = interactIntersects.find(hit => hit.object.userData && hit.object.userData.parentInteract)?.object.userData.parentInteract;
    if (hitInteract) {
        showToast(hitInteract.userData.message);
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
          if (tvScreenMat) {
              const mediaData = newCartridge.userData;
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
          updateUI(newCartridge.userData);
      }});
}

window.ejectCartridge = function(clearUI = true) {
    if (!activeCartridge) return;
    const cart = activeCartridge; activeCartridge = null;
    if (slideshowInterval) { clearInterval(slideshowInterval); slideshowInterval = null; }
    if (tvScreenMat) { tvVideo.pause(); tvVideo.src = ""; tvScreenMat.map = null; tvScreenMat.emissiveMap = null; tvScreenMat.color.setHex(0x000000); tvScreenMat.emissive.setHex(0x000000); tvScreenMat.needsUpdate = true; }
    if (glassMat) { glassMat.emissive.setHex(BLOOM_CONFIG.idleColor); glassMat.emissiveIntensity = BLOOM_CONFIG.idleIntensity; }
    if (clearUI) document.getElementById('ui-panel').classList.remove('active');

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