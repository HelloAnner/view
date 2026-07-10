(() => {
  const factories = new Map();

  window.viewProviderRegistry = {
    register(type, factory) {
      if (!type || typeof factory !== 'function') {
        throw new Error('A view provider requires a type and factory.');
      }
      factories.set(type, factory);
    },
    create(dependencies) {
      return new Map(
        [...factories].map(([type, factory]) => [type, factory(dependencies)])
      );
    },
  };
})();
