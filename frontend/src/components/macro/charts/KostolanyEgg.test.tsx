/**
 * 코스톨라니 달걀모델 컴포넌트 단위 테스트
 * @requirement REQ-006, REQ-007, REQ-008, EDGE-004
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KostolanyEgg } from './KostolanyEgg';
import type { KostolanyData } from '../../../types/macro';

const mockData: KostolanyData = {
  phase: 'A2',
  name: '동행',
  desc: '상승 중. 펀더멘탈 개선이 가격에 반영.',
  action: '보유/매수',
  color: '#06b6d4',
  inputs: {
    monetary: 'loose',
    fed_rate: 2.5,
    vix: 18.5,
    sentiment: 'neutral',
  },
};

describe('KostolanyEgg', () => {
  // UT-K021: REQ-006 - SVG 다이어그램 렌더링
  it('should render SVG egg diagram with 6 phase dots', () => {
    const { container } = render(<KostolanyEgg data={mockData} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();

    // 6개 Phase 라벨 (A1, A2, A3, B1, B2, B3)
    const texts = container.querySelectorAll('text');
    const labels = Array.from(texts).map((t) => t.textContent);
    expect(labels).toContain('A1');
    expect(labels).toContain('A2');
    expect(labels).toContain('A3');
    expect(labels).toContain('B1');
    expect(labels).toContain('B2');
    expect(labels).toContain('B3');
  });

  // UT-K022: REQ-006 - 현재 Phase 하이라이트 (info panel)
  it('should display current phase in info panel', () => {
    const { container } = render(<KostolanyEgg data={mockData} />);
    // Info panel (non-SVG) should contain the phase & name
    const infoPanel = container.querySelector('.bg-\\[\\#0a0e17\\]');
    expect(infoPanel?.textContent).toContain('A2');
    expect(infoPanel?.textContent).toContain('동행');
  });

  // UT-K023: REQ-007 - 판정 근거 표시 (금리 수준)
  it('should display monetary stance', () => {
    const { container } = render(<KostolanyEgg data={mockData} />);
    expect(container.textContent).toContain('완화');
  });

  // UT-K024: REQ-007 - 판정 근거 표시 (심리)
  it('should display sentiment', () => {
    const { container } = render(<KostolanyEgg data={mockData} />);
    expect(container.textContent).toContain('중립');
  });

  // UT-K025: REQ-007 - VIX 값 표시
  it('should display VIX value', () => {
    const { container } = render(<KostolanyEgg data={mockData} />);
    expect(container.textContent).toContain('VIX: 18.5');
  });

  // UT-K026: REQ-007 - 금리 수준 표시
  it('should display fed rate', () => {
    const { container } = render(<KostolanyEgg data={mockData} />);
    expect(container.textContent).toContain('FFR: 2.5%');
  });

  // UT-K027: REQ-004 - action 표시
  it('should display action recommendation', () => {
    const { container } = render(<KostolanyEgg data={mockData} />);
    expect(container.textContent).toContain('보유/매수');
  });

  // UT-K028: REQ-006 - 각 Phase별 렌더링 확인
  it.each([
    { phase: 'A1' as const, name: '매집' },
    { phase: 'A3' as const, name: '과열' },
    { phase: 'B1' as const, name: '분배' },
    { phase: 'B3' as const, name: '과매도' },
  ])('should render phase $phase with name $name', ({ phase, name }) => {
    const data = { ...mockData, phase, name };
    const { container } = render(<KostolanyEgg data={data} />);
    expect(container.textContent).toContain(name);
  });
});
