
class IdCache {
    constructor() {
        this.cache = {}
        this.cached = this.cached.bind(this)
    }
    async cached(name, id, resolver) {
        let key = name + id;
        let cachedVal = this.cache[key]
        if(cachedVal !== undefined) {
            if(cachedVal instanceof Promise) {
                cachedVal = await cachedVal;
                this.cache[key] = cachedVal;
            }
            return cachedVal;
        }
        let val = resolver(id);
        this.cache[key] = val;
        val = await val;
        this.cache[key] = val;
        return val
    }
}

exports.IdCache = IdCache;