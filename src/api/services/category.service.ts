import type { CategoryDto, CategoryUpdateDto } from '../validators/category.validator';

interface Category {
  id: number;
  categoria: string;
  slug: string;
}

export class CategoryService {
  private categories: Category[] = [
    {
      id: 0,
      categoria: 'Adaptadores',
      slug: 'adaptadores',
    },
    {
      id: 1,
      categoria: 'Accesorios',
      slug: 'accesorios',
    },
    {
      id: 2,
      categoria: 'Cables',
      slug: 'cables',
    },
    {
      id: 3,
      categoria: 'Cargadores',
      slug: 'cargadores',
    },
    {
      id: 4,
      categoria: 'Cámaras',
      slug: 'camaras',
    },
    {
      id: 5,
      categoria: 'Herramientas',
      slug: 'herramientas',
    },
    {
      id: 6,
      categoria: 'Otros',
      slug: 'otros',
    },
    {
      id: 7,
      categoria: 'Pantallas',
      slug: 'pantallas',
    },
    {
      id: 8,
      categoria: 'Kit',
      slug: 'kit',
    },
    {
      id: 9,
      categoria: 'MDVR',
      slug: 'mdvr',
    },
    {
      id: 10,
      categoria: 'Sensores',
      slug: 'sensores',
    },
    {
      id: 11,
      categoria: 'Inclinómetros',
      slug: 'inclinometros',
    },
    {
      id: 12,
      categoria: 'Seguridad',
      slug: 'seguridad',
    },
    {
      id: 13,
      categoria: 'Línea Truper',
      slug: 'linea-truper',
    },
    {
      id: 14,
      categoria: 'Splitter',
      slug: 'splitter',
    },
    {
      id: 15,
      categoria: 'Módulos Electrónicos',
      slug: 'modulos-electronicos',
    },
    {
      id: 16,
      categoria: 'Antenas',
      slug: 'antenas',
    },
    {
      id: 17,
      categoria: 'Balanzas',
      slug: 'balanzas',
    },
    {
      id: 18,
      categoria: 'Calibradores',
      slug: 'calibradores',
    },
    {
      id: 19,
      categoria: 'Capturadoras de video',
      slug: 'capturadoras-de-video',
    },
    {
      id: 20,
      categoria: 'Play Station',
      slug: 'play-station',
    },
    {
      id: 21,
      categoria: 'Destornilladores',
      slug: 'destornilladores',
    },
    {
      id: 22,
      categoria: 'Extensiones',
      slug: 'extensiones',
    },
    {
      id: 23,
      categoria: 'Termómetros',
      slug: 'termometros',
    },
    {
      id: 24,
      categoria: 'Relojes',
      slug: 'relojes',
    },
    {
      id: 25,
      categoria: 'Selectores',
      slug: 'selectores',
    },
    {
      id: 26,
      categoria: 'Convertidores',
      slug: 'convertidores',
    },
    {
      id: 27,
      categoria: 'Sistema Inalámbrico',
      slug: 'sistema-inalambrico',
    },
    {
      id: 28,
      categoria: 'Almacenamiento',
      slug: 'almacenamiento',
    },
    {
      id: 29,
      categoria: 'Aerógrafos',
      slug: 'aerografos',
    },
    {
      id: 30,
      categoria: 'Niveladores',
      slug: 'niveladores',
    },
    {
      id: 31,
      categoria: 'Telemetros',
      slug: 'telemetros',
    },
    {
      id: 32,
      categoria: 'Tarjetas de Sonido',
      slug: 'tarjetas-de-sonido',
    },
  ];

  //   constructor(private readonly productService: ProductService) {}

  getAll = () => {
    return this.categories;
  };

  getById = (id: number) => {
    return this.categories.find((category) => category.id === id);
  };

  create = async (category: CategoryDto) => {
    const newCategory = {
      id: this.categories.length,
      categoria: category.categoria,
      slug: category.slug,
    };

    this.categories.push(newCategory);

    return newCategory;
  };

  delete = (id: number): boolean => {
    const category = this.getById(id);
    if (!category) return false;

    this.categories = this.categories.filter((category) => category.id !== id);
    return true;
  };

  update = (id: number, data: CategoryUpdateDto) => {
    const category = this.getById(id);
    if (!category) return false;

    this.categories = this.categories.map((category) => {
      if (category.id === id) {
        return {
          ...category,
          ...data,
        };
      }

      return category;
    });

    return this.getById(id);
  };
}
