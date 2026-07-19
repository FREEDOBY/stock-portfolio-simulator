/** 매크로 카테고리별 독립 페이지 (사이드바 Level 2) */
import { CategoryDetail } from './CategoryDetail';

export const BusinessCyclePage = () => <CategoryDetail categoryId="business_cycle" />;
export const LiquidityPage = () => <CategoryDetail categoryId="liquidity" />;
export const TechnicalPage = () => <CategoryDetail categoryId="technical" />;
export const SentimentPage = () => <CategoryDetail categoryId="sentiment" />;
export const ValuationPage = () => <CategoryDetail categoryId="valuation" />;
export const LaborHouseholdPage = () => <CategoryDetail categoryId="labor_household" />;
