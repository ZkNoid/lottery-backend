export { ProvableType, };
const ProvableType = {
    get(type) {
        return ((typeof type === 'object' || typeof type === 'function') &&
            type !== null &&
            'provable' in type
            ? type.provable
            : type);
    },
};
//# sourceMappingURL=provable-intf.js.map