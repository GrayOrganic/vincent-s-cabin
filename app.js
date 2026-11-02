// ==========================================
// 1. 定义 Pixel & Dither Custom Shader
// ==========================================
const PixelDitherShader = {
    uniforms: {
        "tDiffuse": { value: null },
        "uResolution": { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        "uPixelSize": { value: 4.0 }, // 像素块大小 (越大越复古)
        "uColorCount": { value: 8.0 } // 色阶数量 (配合抖动使用)
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 uResolution;
        uniform float uPixelSize;
        uniform float uColorCount;
        varying vec2 vUv;

        // 4x4 Bayer 矩阵
        const mat4 bayerMatrix = mat4(
            0.0/16.0,  8.0/16.0,  2.0/16.0, 10.0/16.0,
            12.0/16.0, 4.0/16.0, 14.0/16.0,  6.0/16.0,
            3.0/16.0, 11.0/16.0,  1.0/16.0,  9.0/16.0,
            15.0/16.0, 7.0/16.0, 13.0/16.0,  5.0/16.0
        );

        void main() {
            // 像素化计算
            vec2 gridSize = uResolution / uPixelSize;
            vec2 pixelatedUv = floor(vUv * gridSize) / gridSize;
            vec4 texColor = texture2D(tDiffuse, pixelatedUv);

            // 抖动计算
            vec2 screenCoord = pixelatedUv * uResolution;
            int x = int(mod(screenCoord.x / uPixelSize, 4.0));
            int y = int(mod(screenCoord.y / uPixelSize, 4.0));
            
            // WebGL 1.0 兼容的矩阵取值展开
            float bayerValue = 0.0;
            if(x==0) { if(y==0) bayerValue=bayerMatrix[0][0]; else if(y==1) bayerValue=bayerMatrix[0][1]; else if(y==2) bayerValue=bayerMatrix[0][2]; else bayerValue=bayerMatrix[0][3]; }
            else if(x==1) { if(y==0) bayerValue=bayerMatrix[1][0]; else if(y==1) bayerValue=bayerMatrix[1][1]; else if(y==2) bayerValue=bayerMatrix[1][2]; else bayerValue=bayerMatrix[1][3]; }
            else if(x==2) { if(y==0) bayerValue=bayerMatrix[2][0]; else if(y==1) bayerValue=bayerMatrix[2][1]; else if(y==2) bayerValue=bayerMatrix[2][2]; else bayerValue=bayerMatrix[2][3]; }
            else { if(y==0) bayerValue=bayerMatrix[3][0]; else if(y==1) bayerValue=bayerMatrix[3][1]; else if(y==2) bayerValue=bayerMatrix[3][2]; else bayerValue=bayerMatrix[3][3]; }

            // 色阶限制与抖动偏移
            vec3 color = texColor.rgb;
            color = floor(color * uColorCount + (bayerValue - 0.5)) / uColorCount;

            gl_FragColor = vec4(color, texColor.a);
        }
    `
};

// ==========================================
// 2. 场景基础与后处理初始化
// ==========================================
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05050a, 0.04);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const initialCameraPos = { x: 0, y: 1.6, z: 10 };
camera.position.set(initialCameraPos.x, initialCameraPos.y, initialCameraPos.z);

// 因为有像素滤镜，关闭原生抗锯齿以提升性能
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1); // 锁定像素比，避免高分屏滤镜效果不一致
renderer.shadowMap.enabled = true;
document.getElementById('canvas-container').appendChild(renderer.domElement);

// 初始化 EffectComposer
const composer = new THREE.EffectComposer(renderer);
const renderPass = new THREE.RenderPass(scene, camera);
composer.addPass(renderPass);

const ditherPass = new THREE.ShaderPass(PixelDitherShader);
composer.addPass(ditherPass);

// ==========================================
// 3. 场景打光与模型搭建 (占位模型)
// ==========================================
const ambientLight = new THREE.AmbientLight(0x151525, 10);
scene.add(ambientLight);

const fireLight = new THREE.PointLight(0xff6600, 20, 20);
fireLight.position.set(3, 1, 4);
fireLight.castShadow = true;
scene.add(fireLight);

// 地面
const groundMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0f, roughness: 1.0 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 占位木屋
const cabinMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
const cabin = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 6), cabinMat);
cabin.position.set(0, 2.5, 0);
cabin.castShadow = true;
scene.add(cabin);

// 占位门 (关键交互物件)
const doorMat = new THREE.MeshStandardMaterial({ color: 0x3d2314 });
const door = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3, 0.2), doorMat);
door.position.set(0, 1.5, 3.1);
door.name = "CabinDoor";
scene.add(door);

// 占位篝火
const fireMat = new THREE.MeshBasicMaterial({ color: 0xff4500 });
const campfire = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), fireMat);
campfire.position.copy(fireLight.position);
scene.add(campfire);

// ==========================================
// 4. 交互逻辑 (Raycaster & GSAP)
// ==========================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isInside = false;

window.addEventListener('click', (event) => {
    if (isInside) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children);

    if (intersects.length > 0 && intersects[0].object.name === "CabinDoor") {
        enterCabin();
    }
});

function enterCabin() {
    isInside = true;
    document.getElementById('cursor-hint').style.display = 'none';

    // 摄像机推进动画
    gsap.to(camera.position, {
        x: 0, y: 1.6, z: 1.5, // 移动到门内部
        duration: 1.8,
        ease: "power2.inOut",
        onComplete: () => {
            const uiLayer = document.getElementById('ui-layer');
            uiLayer.style.display = 'block';
            setTimeout(() => uiLayer.style.opacity = '1', 50);
        }
    });
}

window.exitCabin = function() {
    const uiLayer = document.getElementById('ui-layer');
    uiLayer.style.opacity = '0';

    setTimeout(() => {
        uiLayer.style.display = 'none';

        // 摄像机后退动画
        gsap.to(camera.position, {
            x: initialCameraPos.x, y: initialCameraPos.y, z: initialCameraPos.z,
            duration: 1.8,
            ease: "power2.inOut",
            onComplete: () => {
                isInside = false;
                document.getElementById('cursor-hint').style.display = 'block';
            }
        });
    }, 1500);
};

// ==========================================
// 5. 渲染循环与自适应
// ==========================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    // 篝火闪烁效果
    const time = clock.getElapsedTime();
    fireLight.intensity = 2.5 + Math.sin(time * 15) * 0.5;

    // 使用 Composer 渲染后处理画面
    composer.render();
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    const w = window.innerWidth;
    const h = window.innerHeight;

    renderer.setSize(w, h);
    composer.setSize(w, h);
    ditherPass.uniforms["uResolution"].value.set(w, h);
});