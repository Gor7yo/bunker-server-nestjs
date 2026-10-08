import { CardKey } from '../card.types';
export interface IPropertyItem {
    id: number;
    value: string;
    description?: string;
    experience?: string;
}
export interface IPropertyCategory {
    category: CardKey;
    items: IPropertyItem[];
}
export declare const PROPERTY_CATEGORIES: IPropertyCategory[];
