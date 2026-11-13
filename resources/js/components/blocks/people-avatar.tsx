import {
    Avatar,
    AvatarFallback,
    AvatarGroup,
    AvatarGroupCount,
    AvatarImage,
} from "@/components/ui/avatar";
export interface AvatarPerson {
    id: string | number;
    name: string;
    image?: string;
}
export function PersonAvatar({
    person,
    size = "default",
}: {
    person: AvatarPerson;
    size?: "sm" | "default" | "lg";
}) {
    const initials = person.name
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
    return (
        <Avatar size={size} title={person.name} aria-label={person.name}>
            {person.image && (
                <AvatarImage src={person.image} alt={person.name} />
            )}
            <AvatarFallback>{initials || "?"}</AvatarFallback>
        </Avatar>
    );
}
export function PeopleGroup({
    people,
    max = 3,
    size = "sm",
}: {
    people: AvatarPerson[];
    max?: number;
    size?: "sm" | "default" | "lg";
}) {
    const limit = Math.max(1, Math.floor(max));
    return (
        <AvatarGroup aria-label={people.map((p) => p.name).join(", ")}>
            {people.slice(0, limit).map((person) => (
                <PersonAvatar key={person.id} person={person} size={size} />
            ))}
            {people.length > limit && (
                <AvatarGroupCount
                    title={people
                        .slice(limit)
                        .map((p) => p.name)
                        .join(", ")}
                >
                    +{people.length - limit}
                </AvatarGroupCount>
            )}
        </AvatarGroup>
    );
}
