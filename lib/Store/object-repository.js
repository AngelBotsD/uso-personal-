"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObjectRepository = void 0;
class ObjectRepository {
    constructor(entities = {}) {
        this.entityMap = new Map(Object.entries(entities));
        this.maxSize = 1000; // Tamaño máximo del repositorio
    }
    findById(id) {
        return this.entityMap.get(id);
    }
    findAll() {
        return Array.from(this.entityMap.values());
    }
    upsertById(id, entity) {
        return this.entityMap.set(id, { ...entity });
    }
    deleteById(id) {
        return this.entityMap.delete(id);
    }
    count() {
        return this.entityMap.size;
    }
    toJSON() {
        return this.findAll();
    }
    // Método para limpiar el repositorio si supera el tamaño máximo
    cleanup() {
        if (this.entityMap.size > this.maxSize) {
            const keys = Array.from(this.entityMap.keys());
            for (let i = 0; i < keys.length / 2; i++) {
                this.entityMap.delete(keys[i]);
            }
        }
    }
    // Método para buscar por una propiedad específica
    findByProperty(property, value) {
        const results = [];
        for (const [id, entity] of this.entityMap) {
            if (entity[property] === value) {
                results.push(entity);
            }
        }
        return results;
    }
}
exports.ObjectRepository = ObjectRepository;