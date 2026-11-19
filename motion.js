const stage = document.querySelector('.product-stage');
const product = document.querySelector('#showcase-image');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const models = { pink: ['Volt S', 240], acid: ['City Pop', 180], cyan: ['Long Way', 340] };
document.querySelectorAll('[data-model]').forEach(button => {
  button.addEventListener('click', () => {
    const tone = button.dataset.model;
    document.querySelectorAll('[data-model]').forEach(item => {
      item.classList.toggle('is-active', item === button);
      item.setAttribute('aria-pressed', String(item === button));
    });
    stage.dataset.tone = tone;
    product.src = `assets/scooter-${tone}.png`;
    product.alt = `Самокат ${models[tone][0]}`;
    document.querySelector('#showcase-name').textContent = models[tone][0];
    document.querySelector('#showcase-price').textContent = `от ${models[tone][1]} ₽ / час`;
    if (!reduce.matches) {
      product.getAnimations().forEach(animation => animation.cancel());
      product.animate([{ opacity: 0, transform: 'translateX(60px) rotate(9deg) scale(.85)' }, { opacity: 1, transform: 'translateX(0) rotate(0) scale(1)' }], { duration: 650, easing: 'cubic-bezier(.16,1,.3,1)' });
    }
  });
});
stage.addEventListener('pointermove', event => {
  if (reduce.matches || event.pointerType !== 'mouse') return;
  const rect = stage.getBoundingClientRect();
  stage.style.setProperty('--tilt', `${(event.clientX - rect.left - rect.width / 2) / 65}deg`);
});
stage.addEventListener('pointerleave', () => stage.style.setProperty('--tilt', '0deg'));
