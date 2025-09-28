import { eq } from 'drizzle-orm';
import { Bcrypt } from '../../adapters/bcrypt.adapter';
import { Jwt } from '../../adapters/jwt.adapter';
import { db, type Transaction } from '../../db';
import { userTable } from '../../db/schemas';
import { CustomError } from '../../domain/errors/custom.error';
import { createColumnReferences } from '../utils';
import type { UserDto, UserLoginDto } from '../validators';

const columnsToSelect = {
  id: true,
  userName: true,
  name: true,
  lastName: true,
  email: true,
  role: true,
} as const;

export class AuthService {
  private getByEmail = async (email: string, tx?: Transaction) => {
    const user = await (tx ?? db).query.userTable.findFirst({
      where: eq(userTable.email, email),
      columns: { ...columnsToSelect, password: true },
    });
    return user;
  };

  private getByUserName = async (userName: string, tx?: Transaction) => {
    const user = await (tx ?? db).query.userTable.findFirst({
      where: eq(userTable.userName, userName),
      columns: { ...columnsToSelect, password: true },
    });
    return user;
  };

  login = async (user: UserLoginDto) => {
    const userDb = await this.getByUserName(user.userName);
    if (!userDb) throw CustomError.unauthorized('Username or password are incorrect.');

    const { password, ...rest } = userDb;

    const passwordMatch = await Bcrypt.compare(user.password, password);
    if (!passwordMatch) throw CustomError.unauthorized('Username or password are incorrect.');

    const token = await Jwt.generate({ userName: user.userName, role: userDb.role });
    if (!token) throw CustomError.internalServer('Error creating JWT.');

    return {
      user: rest,
      token,
    };
  };

  register = async (user: UserDto) => {
    if (await this.getByEmail(user.email)) throw CustomError.conflict('Email already exists in database.');
    if (await this.getByUserName(user.userName)) throw CustomError.conflict('Username already exists in database.');

    const { password, ...rest } = user;

    try {
      const hashPassword = await Bcrypt.hash(password);

      const [newUser] = await db
        .insert(userTable)
        .values({ ...rest, password: hashPassword })
        .returning(createColumnReferences(columnsToSelect, userTable));

      return newUser;
    } catch (_error) {
      throw CustomError.internalServer('Error creating the user.');
    }
  };

  //   create = async (catalog: CatalogDto) => {
  //     if (await this.slugExists(catalog.slug)) throw CustomError.conflict('Slug already exists in database.');
  //     const [newCatalog] = await db
  //       .insert(catalogTable)
  //       .values(catalog)
  //       .returning(createColumnReferences(columnsToSelect, catalogTable));

  //     return newCatalog;
  //   };

  //   delete = async (id: number): Promise<boolean> => {
  //     await this.getById(id);
  //     await db.delete(catalogTable).where(eq(catalogTable.id, id));
  //     return true;
  //   };

  //   update = async (id: number, data: CatalogUpdateDto) => {
  //     if (data.slug && (await this.slugExists(data.slug))) throw CustomError.conflict('Slug already exists in database.');

  //     await this.getById(id);
  //     const [updateCatalog] = await db
  //       .update(catalogTable)
  //       .set(data)
  //       .where(eq(catalogTable.id, id))
  //       .returning(createColumnReferences(columnsToSelect, catalogTable));

  //     return updateCatalog;
  //   };
}
