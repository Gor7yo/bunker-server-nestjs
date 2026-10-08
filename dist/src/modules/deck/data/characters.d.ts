export interface IPropertyItem {
    value: string;
    description?: string;
    experience?: string;
    id: number;
}
export interface IPropertyCategory {
    category: string;
    items: IPropertyItem[];
}
export type IPlayerCard = {
    age: string | null;
    profession: string | null;
    health: string | null;
    fobia: string | null;
    hobbie: string | null;
    bandage: string | null;
    action: string | null;
    fact: string | null;
};
export type UsedCards = {
    age: Set<string>;
    profession: Set<string>;
    health: Set<string>;
    fobia: Set<string>;
    hobbie: Set<string>;
    bandage: Set<string>;
    action: Set<string>;
    fact: Set<string>;
};
export declare const PROPERTY_CATEGORIES: IPropertyCategory[];
