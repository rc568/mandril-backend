import { eq } from 'drizzle-orm';
import { Bcrypt } from '../../adapters/bcrypt.adapter';
import { Jwt } from '../../adapters/jwt.adapter';
import { db, type Transaction } from '../../db';
import { userTable } from '../../db/schemas';
import { errorMessages } from '../../domain/constants';
import { CustomError } from '../../domain/errors/custom.error';
import type { CustomPayload, Payload } from '../../types/jwt.types';
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
      columns: { ...columnsToSelect, password: true, deletedAt: true },
    });
    return user;
  };

  private getByUserName = async (userName: string, tx?: Transaction) => {
    const user = await (tx ?? db).query.userTable.findFirst({
      where: eq(userTable.userName, userName),
      columns: { ...columnsToSelect, password: true, deletedAt: true },
    });
    return user;
  };

  private getById = async (id: string, tx?: Transaction) => {
    const user = await (tx ?? db).query.userTable.findFirst({
      where: eq(userTable.id, id),
      columns: { deletedAt: true },
    });
    return user;
  };

  login = async (user: UserLoginDto) => {
    const userDb = await this.getByUserName(user.userName);

    const passwordToCompare = userDb?.password ?? 'XXX';
    const passwordMatch = await Bcrypt.compare(user.password, passwordToCompare);
    if (!userDb || !passwordMatch || userDb.deletedAt)
      throw CustomError.unauthorized(errorMessages.auth.loginInvalidCredentials);

    const { password: _password, ...rest } = userDb;

    const payload: CustomPayload = { userName: user.userName, role: userDb.role };

    try {
      const accessToken = await Jwt.generateAccessToken({ ...payload, id: userDb.id });
      const refreshToken = await Jwt.generateRefreshToken(payload);

      await db.update(userTable).set({ refreshToken: refreshToken }).where(eq(userTable.id, userDb.id));

      return {
        user: rest,
        accessToken,
        refreshToken,
      };
    } catch (error) {
      throw CustomError.internalServer(errorMessages.auth.errorCreatingJwt, error as Error);
    }
  };

  register = async (user: UserDto) => {
    if (await this.getByEmail(user.email)) throw CustomError.conflict(errorMessages.auth.emailExists);
    if (await this.getByUserName(user.userName)) throw CustomError.conflict(errorMessages.auth.userNameExists);

    const { password, ...rest } = user;
    const hashPassword = await Bcrypt.hash(password);

    const [newUser] = await db
      .insert(userTable)
      .values({ ...rest, password: hashPassword })
      .returning(createColumnReferences(columnsToSelect, userTable));

    return newUser;
  };

  refresh = async (refreshToken: string) => {
    const decoded = await Jwt.verifyRefreshToken<Payload>(refreshToken);
    if (!decoded) throw CustomError.forbidden(errorMessages.auth.invalidJwt);

    const userDb = await db.query.userTable.findFirst({
      where: eq(userTable.userName, decoded.userName),
      columns: { refreshToken: true, userName: true, role: true, deletedAt: true },
    });

    if (!userDb || userDb.refreshToken !== refreshToken) throw CustomError.forbidden(errorMessages.auth.invalidJwt);
    if (userDb.deletedAt) throw CustomError.forbidden(errorMessages.auth.userNotFound);

    try {
      const accessToken = await Jwt.generateAccessToken({ userName: userDb.userName, role: userDb.role });
      return accessToken;
    } catch (error) {
      throw CustomError.internalServer(errorMessages.auth.errorCreatingJwt, error as Error);
    }
  };

  logout = async (refreshToken: string) => {
    const decoded = await Jwt.verifyRefreshToken<Payload>(refreshToken);
    if (!decoded) throw CustomError.forbidden(errorMessages.auth.invalidJwt);

    const user = await this.getByUserName(decoded.userName);
    if (!user) throw CustomError.forbidden(errorMessages.auth.invalidJwt);

    await db.update(userTable).set({ refreshToken: null }).where(eq(userTable.userName, decoded.userName));
    return true;
  };

  softDelete = async (userId: string) => {
    const user = await this.getById(userId);

    if (!user || user.deletedAt) throw CustomError.notFound(errorMessages.auth.userNotFound);

    await db.update(userTable).set({ refreshToken: null, deletedAt: new Date() }).where(eq(userTable.id, userId));
    return true;
  };
}
