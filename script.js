document.addEventListener("DOMContentLoaded", () => {
    // 1. 滚动时的淡入动画 (Intersection Observer)
    const fadeElements = document.querySelectorAll('.fade-in');

    const appearOptions = {
        threshold: 0.15,
        rootMargin: "0px 0px -50px 0px"
    };

    const appearOnScroll = new IntersectionObserver(function(entries, observer) {
        entries.forEach(entry => {
            if (!entry.isIntersecting) {
                return;
            } else {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, appearOptions);

    fadeElements.forEach(element => {
        appearOnScroll.observe(element);
    });

    // 2. 简单的打字机效果 (用于Hero区域的Tagline)
    const textElement = document.getElementById('typing-text');
    const textToType = "Interactive Media Developer | 3D Artist | Researcher";
    let index = 0;

    // 清空初始文本
    textElement.textContent = "";

    function typeWriter() {
        if (index < textToType.length) {
            textElement.textContent += textToType.charAt(index);
            index++;
            setTimeout(typeWriter, 50); // 控制打字速度
        }
    }

    // 延迟500ms后开始打字动画
    setTimeout(typeWriter, 500);
});