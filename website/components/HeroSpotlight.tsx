'use client';
import {useEffect,useRef} from 'react';

/* A soft glow that follows the pointer across the hero. Mouse and pen only: touch screens and
   reduced-motion users keep the still backdrop. One rAF per frame at most, nothing on scroll. */
export function HeroSpotlight(){
  const glow=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const el=glow.current,hero=el?.parentElement;
    if(!el||!hero||matchMedia('(prefers-reduced-motion: reduce), (hover: none)').matches)return;
    let raf=0,x=0,y=0;
    const paint=()=>{raf=0;el.style.setProperty('--mx',`${x}px`);el.style.setProperty('--my',`${y}px`);};
    const move=(e:PointerEvent)=>{const box=hero.getBoundingClientRect();x=e.clientX-box.left;y=e.clientY-box.top;el.classList.add('on');if(!raf)raf=requestAnimationFrame(paint);};
    const leave=()=>el.classList.remove('on');
    hero.addEventListener('pointermove',move);hero.addEventListener('pointerleave',leave);
    return()=>{cancelAnimationFrame(raf);hero.removeEventListener('pointermove',move);hero.removeEventListener('pointerleave',leave);};
  },[]);
  return <div className="hero-spotlight" ref={glow} aria-hidden="true"/>;
}
